package main

import (
	"flag"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/pterodactyl-cp/edge-agent/internal/agent"
	"github.com/pterodactyl-cp/edge-agent/internal/config"
	"github.com/sirupsen/logrus"
)

const (
	Version = "1.0.0"
)

func main() {
	var (
		configPath    = flag.String("config", "/etc/hosting-agent/config.yaml", "Path to configuration file")
		logLevel      = flag.String("log-level", "info", "Log level (debug, info, warn, error)")
		version       = flag.Bool("version", false, "Show version information")
		installMode   = flag.Bool("install", false, "Install mode for initial setup")
		enrollToken   = flag.String("enroll-token", "", "Enrollment token for registration")
		controlPlaneURL = flag.String("control-plane", "", "Control plane URL")
	)
	flag.Parse()

	if *version {
		logrus.Infof("Pterodactyl Control Plane Edge Agent v%s", Version)
		os.Exit(0)
	}

	// Configure logging
	level, err := logrus.ParseLevel(*logLevel)
	if err != nil {
		logrus.WithError(err).Fatal("Invalid log level")
	}
	logrus.SetLevel(level)
	logrus.SetFormatter(&logrus.TextFormatter{
		FullTimestamp: true,
	})

	logger := logrus.WithFields(logrus.Fields{
		"component": "main",
		"version":   Version,
	})

	logger.Info("Starting Pterodactyl Control Plane Edge Agent")

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		if *installMode && (*enrollToken == "" || *controlPlaneURL == "") {
			logger.Fatal("Install mode requires --enroll-token and --control-plane flags")
		} else if *installMode {
			// Create initial configuration for enrollment
			cfg = &config.Config{
				ControlPlane: config.ControlPlaneConfig{
					URL:         *controlPlaneURL,
					EnrollToken: *enrollToken,
				},
				Agent: config.AgentConfig{
					LogLevel:        *logLevel,
					HeartbeatInterval: 30,
					MetricsInterval:   60,
				},
			}
			
			// Create config directory
			if err := os.MkdirAll(filepath.Dir(*configPath), 0755); err != nil {
				logger.WithError(err).Fatal("Failed to create config directory")
			}
			
			// Save initial config
			if err := config.Save(*configPath, cfg); err != nil {
				logger.WithError(err).Fatal("Failed to save initial configuration")
			}
			logger.Info("Initial configuration saved")
		} else {
			logger.WithError(err).Fatal("Failed to load configuration")
		}
	}

	// Create and start agent
	a, err := agent.New(cfg, logger)
	if err != nil {
		logger.WithError(err).Fatal("Failed to create agent")
	}

	// Handle shutdown gracefully
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigChan
		logger.WithField("signal", sig).Info("Received shutdown signal")
		a.Stop()
	}()

	// Start the agent
	if err := a.Start(); err != nil {
		logger.WithError(err).Fatal("Agent failed to start")
	}

	logger.Info("Agent stopped")
}