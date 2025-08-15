package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/pterodactyl-cp/edge-agent/internal/config"
	"github.com/pterodactyl-cp/edge-agent/internal/metrics"
	"github.com/sirupsen/logrus"
)

type Agent struct {
	config     *config.Config
	logger     *logrus.Entry
	httpClient *http.Client
	ctx        context.Context
	cancel     context.CancelFunc
	metrics    *metrics.Collector
}

type EnrollmentRequest struct {
	Token    string                 `json:"token"`
	NodeInfo map[string]interface{} `json:"node_info"`
}

type EnrollmentResponse struct {
	NodeID     string `json:"node_id"`
	AuthToken  string `json:"auth_token"`
	WingsConfig map[string]interface{} `json:"wings_config"`
}

type HeartbeatRequest struct {
	AgentVersion  string                 `json:"agent_version"`
	WingsVersion  string                 `json:"wings_version,omitempty"`
	System        map[string]interface{} `json:"system"`
}

func New(cfg *config.Config, logger *logrus.Entry) (*Agent, error) {
	ctx, cancel := context.WithCancel(context.Background())
	
	httpClient := &http.Client{
		Timeout: 30 * time.Second,
	}

	metricsCollector, err := metrics.New()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to create metrics collector: %w", err)
	}

	return &Agent{
		config:     cfg,
		logger:     logger,
		httpClient: httpClient,
		ctx:        ctx,
		cancel:     cancel,
		metrics:    metricsCollector,
	}, nil
}

func (a *Agent) Start() error {
	a.logger.Info("Starting edge agent")

	// If we don't have an auth token, enroll first
	if a.config.ControlPlane.AuthToken == "" && a.config.ControlPlane.EnrollToken != "" {
		if err := a.enroll(); err != nil {
			return fmt.Errorf("enrollment failed: %w", err)
		}
	}

	// Validate we have authentication
	if a.config.ControlPlane.AuthToken == "" {
		return fmt.Errorf("no authentication token available")
	}

	// Start heartbeat loop
	ticker := time.NewTicker(time.Duration(a.config.Agent.HeartbeatInterval) * time.Second)
	defer ticker.Stop()

	// Send initial heartbeat
	if err := a.sendHeartbeat(); err != nil {
		a.logger.WithError(err).Error("Failed to send initial heartbeat")
	}

	for {
		select {
		case <-a.ctx.Done():
			a.logger.Info("Agent stopping")
			return nil
		case <-ticker.C:
			if err := a.sendHeartbeat(); err != nil {
				a.logger.WithError(err).Error("Failed to send heartbeat")
			}
		}
	}
}

func (a *Agent) Stop() {
	a.logger.Info("Stopping agent")
	a.cancel()
}

func (a *Agent) enroll() error {
	a.logger.Info("Starting enrollment process")

	nodeInfo, err := a.gatherNodeInfo()
	if err != nil {
		return fmt.Errorf("failed to gather node info: %w", err)
	}

	enrollReq := EnrollmentRequest{
		Token:    a.config.ControlPlane.EnrollToken,
		NodeInfo: nodeInfo,
	}

	var enrollResp EnrollmentResponse
	if err := a.makeRequest("POST", "/agent/enroll", enrollReq, &enrollResp); err != nil {
		return fmt.Errorf("enrollment request failed: %w", err)
	}

	// Update configuration with received data
	a.config.Agent.NodeID = enrollResp.NodeID
	a.config.ControlPlane.AuthToken = enrollResp.AuthToken
	a.config.ControlPlane.EnrollToken = "" // Clear enrollment token

	// Save updated configuration
	if err := config.Save("/etc/hosting-agent/config.yaml", a.config); err != nil {
		a.logger.WithError(err).Warn("Failed to save updated configuration")
	}

	// Configure Wings if configuration provided
	if len(enrollResp.WingsConfig) > 0 {
		if err := a.configureWings(enrollResp.WingsConfig); err != nil {
			a.logger.WithError(err).Error("Failed to configure Wings")
		}
	}

	a.logger.WithField("node_id", enrollResp.NodeID).Info("Enrollment completed successfully")
	return nil
}

func (a *Agent) sendHeartbeat() error {
	systemMetrics, err := a.metrics.Collect()
	if err != nil {
		a.logger.WithError(err).Warn("Failed to collect system metrics")
		systemMetrics = make(map[string]interface{})
	}

	wingsVersion, _ := a.getWingsVersion()

	heartbeat := HeartbeatRequest{
		AgentVersion: "1.0.0",
		WingsVersion: wingsVersion,
		System:       systemMetrics,
	}

	return a.makeRequest("POST", "/agent/heartbeat", heartbeat, nil)
}

func (a *Agent) gatherNodeInfo() (map[string]interface{}, error) {
	hostname, _ := os.Hostname()
	
	// Get system information
	systemInfo := map[string]interface{}{
		"hostname":     hostname,
		"architecture": runtime.GOARCH,
		"platform":     runtime.GOOS,
	}

	// Try to get additional system info
	if cpuInfo, err := a.getCPUInfo(); err == nil {
		systemInfo["cpu_cores"] = cpuInfo["cores"]
		systemInfo["cpu_model"] = cpuInfo["model"]
	}

	if memInfo, err := a.getMemoryInfo(); err == nil {
		systemInfo["memory_mb"] = memInfo["total_mb"]
	}

	if diskInfo, err := a.getDiskInfo(); err == nil {
		systemInfo["disk_gb"] = diskInfo["total_gb"]
	}

	if networkInfo, err := a.getNetworkInfo(); err == nil {
		systemInfo["public_ip"] = networkInfo["public_ip"]
		systemInfo["private_ip"] = networkInfo["private_ip"]
	}

	return systemInfo, nil
}

func (a *Agent) makeRequest(method, endpoint string, body interface{}, response interface{}) error {
	url := strings.TrimSuffix(a.config.ControlPlane.URL, "/") + "/api" + endpoint

	var reqBody []byte
	if body != nil {
		var err error
		reqBody, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}

	req, err := http.NewRequestWithContext(a.ctx, method, url, bytes.NewBuffer(reqBody))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if a.config.ControlPlane.AuthToken != "" {
		req.Header.Set("Authorization", "Bearer "+a.config.ControlPlane.AuthToken)
	}

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, resp.Status)
	}

	if response != nil {
		return json.NewDecoder(resp.Body).Decode(response)
	}

	return nil
}

func (a *Agent) configureWings(config map[string]interface{}) error {
	a.logger.Info("Configuring Wings daemon")

	// Convert config to YAML and write to file
	configYAML, err := json.Marshal(config)
	if err != nil {
		return err
	}

	if err := os.WriteFile(a.config.Wings.ConfigPath, configYAML, 0600); err != nil {
		return fmt.Errorf("failed to write Wings config: %w", err)
	}

	// Restart Wings service
	if err := a.restartWings(); err != nil {
		return fmt.Errorf("failed to restart Wings: %w", err)
	}

	return nil
}

func (a *Agent) restartWings() error {
	cmd := exec.Command("systemctl", "restart", a.config.Wings.SystemdUnit)
	if err := cmd.Run(); err != nil {
		return err
	}

	// Wait a moment and check if it started successfully
	time.Sleep(5 * time.Second)
	
	cmd = exec.Command("systemctl", "is-active", a.config.Wings.SystemdUnit)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("Wings service failed to start")
	}

	a.logger.Info("Wings service restarted successfully")
	return nil
}

func (a *Agent) getWingsVersion() (string, error) {
	cmd := exec.Command("wings", "--version")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}

	// Parse version from output
	version := strings.TrimSpace(string(output))
	if strings.Contains(version, " ") {
		parts := strings.Fields(version)
		if len(parts) > 1 {
			version = parts[1]
		}
	}

	return version, nil
}

// System information gathering methods
func (a *Agent) getCPUInfo() (map[string]interface{}, error) {
	// Implementation would use gopsutil to get CPU info
	return map[string]interface{}{
		"cores": runtime.NumCPU(),
		"model": "Unknown",
	}, nil
}

func (a *Agent) getMemoryInfo() (map[string]interface{}, error) {
	// Implementation would use gopsutil to get memory info
	return map[string]interface{}{
		"total_mb": 4096, // Placeholder
	}, nil
}

func (a *Agent) getDiskInfo() (map[string]interface{}, error) {
	// Implementation would use gopsutil to get disk info
	return map[string]interface{}{
		"total_gb": 100, // Placeholder
	}, nil
}

func (a *Agent) getNetworkInfo() (map[string]interface{}, error) {
	// Implementation would detect network interfaces and IPs
	return map[string]interface{}{
		"public_ip":  "0.0.0.0",
		"private_ip": "127.0.0.1",
	}, nil
}