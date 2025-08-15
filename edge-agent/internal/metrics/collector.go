package metrics

import (
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

type Collector struct {
	lastNetStats map[string]net.IOCountersStat
	lastTime     time.Time
}

func New() (*Collector, error) {
	return &Collector{
		lastNetStats: make(map[string]net.IOCountersStat),
		lastTime:     time.Now(),
	}, nil
}

func (c *Collector) Collect() (map[string]interface{}, error) {
	metrics := make(map[string]interface{})

	// CPU Usage
	if cpuPercent, err := cpu.Percent(time.Second, false); err == nil && len(cpuPercent) > 0 {
		metrics["cpuUsage"] = cpuPercent[0]
	}

	// Memory Usage
	if memStat, err := mem.VirtualMemory(); err == nil {
		metrics["memoryUsage"] = memStat.UsedPercent
		metrics["memoryTotal"] = memStat.Total
		metrics["memoryUsed"] = memStat.Used
		metrics["memoryAvailable"] = memStat.Available
	}

	// Disk Usage (root partition)
	if diskStat, err := disk.Usage("/"); err == nil {
		metrics["diskUsage"] = diskStat.UsedPercent
		metrics["diskTotal"] = diskStat.Total
		metrics["diskUsed"] = diskStat.Used
		metrics["diskFree"] = diskStat.Free
	}

	// Network I/O
	if netStats, err := net.IOCounters(false); err == nil && len(netStats) > 0 {
		totalStat := netStats[0] // Get total for all interfaces
		
		// Calculate rates if we have previous data
		now := time.Now()
		timeDiff := now.Sub(c.lastTime).Seconds()
		
		if c.lastTime.IsZero() || timeDiff < 1 {
			// First run or too little time passed
			metrics["networkRx"] = totalStat.BytesRecv
			metrics["networkTx"] = totalStat.BytesSent
		} else {
			// Calculate rates
			rxRate := float64(totalStat.BytesRecv) / timeDiff
			txRate := float64(totalStat.BytesSent) / timeDiff
			
			metrics["networkRx"] = totalStat.BytesRecv
			metrics["networkTx"] = totalStat.BytesSent
			metrics["networkRxRate"] = rxRate
			metrics["networkTxRate"] = txRate
		}
		
		c.lastTime = now
	}

	// System uptime
	if hostStat, err := host.Info(); err == nil {
		metrics["uptime"] = hostStat.Uptime
		metrics["hostname"] = hostStat.Hostname
		metrics["platform"] = hostStat.Platform
		metrics["platformVersion"] = hostStat.PlatformVersion
	}

	// Load average (Linux/Unix only)
	if loadStat, err := host.SensorsTemperatures(); err == nil {
		// This is a placeholder - actual load average would use different method
		metrics["loadAverage"] = len(loadStat) // Placeholder
	}

	return metrics, nil
}

func (c *Collector) GetSystemInfo() (map[string]interface{}, error) {
	info := make(map[string]interface{})

	// Host information
	if hostInfo, err := host.Info(); err == nil {
		info["hostname"] = hostInfo.Hostname
		info["platform"] = hostInfo.Platform
		info["platformFamily"] = hostInfo.PlatformFamily
		info["platformVersion"] = hostInfo.PlatformVersion
		info["kernelVersion"] = hostInfo.KernelVersion
		info["kernelArch"] = hostInfo.KernelArch
	}

	// CPU information
	if cpuInfo, err := cpu.Info(); err == nil && len(cpuInfo) > 0 {
		info["cpuModel"] = cpuInfo[0].ModelName
		info["cpuCores"] = len(cpuInfo)
		info["cpuMhz"] = cpuInfo[0].Mhz
	}

	// Memory information
	if memInfo, err := mem.VirtualMemory(); err == nil {
		info["memoryTotal"] = memInfo.Total
	}

	// Disk information
	if diskInfo, err := disk.Usage("/"); err == nil {
		info["diskTotal"] = diskInfo.Total
	}

	return info, nil
}