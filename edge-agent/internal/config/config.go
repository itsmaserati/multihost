package config

import (
	"io/ioutil"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	ControlPlane ControlPlaneConfig `yaml:"control_plane"`
	Agent        AgentConfig        `yaml:"agent"`
	Wings        WingsConfig        `yaml:"wings"`
}

type ControlPlaneConfig struct {
	URL         string `yaml:"url"`
	EnrollToken string `yaml:"enroll_token,omitempty"`
	AuthToken   string `yaml:"auth_token,omitempty"`
	TLSSkipVerify bool `yaml:"tls_skip_verify"`
}

type AgentConfig struct {
	NodeID            string `yaml:"node_id,omitempty"`
	LogLevel          string `yaml:"log_level"`
	HeartbeatInterval int    `yaml:"heartbeat_interval"` // seconds
	MetricsInterval   int    `yaml:"metrics_interval"`   // seconds
	DataDir           string `yaml:"data_dir"`
}

type WingsConfig struct {
	ConfigPath    string `yaml:"config_path"`
	SystemdUnit   string `yaml:"systemd_unit"`
	LogPath       string `yaml:"log_path"`
	AutoRestart   bool   `yaml:"auto_restart"`
}

func Load(path string) (*Config, error) {
	data, err := ioutil.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	// Set defaults
	if cfg.Agent.LogLevel == "" {
		cfg.Agent.LogLevel = "info"
	}
	if cfg.Agent.HeartbeatInterval == 0 {
		cfg.Agent.HeartbeatInterval = 30
	}
	if cfg.Agent.MetricsInterval == 0 {
		cfg.Agent.MetricsInterval = 60
	}
	if cfg.Agent.DataDir == "" {
		cfg.Agent.DataDir = "/var/lib/hosting-agent"
	}
	if cfg.Wings.ConfigPath == "" {
		cfg.Wings.ConfigPath = "/etc/pterodactyl/config.yml"
	}
	if cfg.Wings.SystemdUnit == "" {
		cfg.Wings.SystemdUnit = "wings.service"
	}
	if cfg.Wings.LogPath == "" {
		cfg.Wings.LogPath = "/var/log/pterodactyl/wings.log"
	}

	return &cfg, nil
}

func Save(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}

	return ioutil.WriteFile(path, data, 0600)
}