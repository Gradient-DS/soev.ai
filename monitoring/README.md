# soev.ai Monitoring Setup

This directory contains the monitoring configuration for the soev.ai project using Prometheus, Alertmanager, and Grafana, fronted by Nginx.

## Overview

- **Prometheus**: Metrics collection and storage
- **Alertmanager**: Alert routing and notifications (Slack)
- **Grafana**: Visualization and dashboards
- **Node Exporter**: Host metrics (CPU, memory, disk, network)
- **LibreChat Exporter**: Application metrics from MongoDB (messages, tokens, users, models)

## Quick Start (Local Development)

```bash
# Start the monitoring stack with LibreChat
docker-compose -f docker-compose.staging.yml up -d

# Access via Nginx (port 80 exposed)
# Application:   http://localhost/
# Grafana:       http://localhost/grafana/
# Prometheus:    http://localhost/prometheus/
# Alertmanager:  http://localhost/alertmanager/
# Raw metrics:   http://localhost/metrics
```

## Metrics Collected

### LibreChat Exporter (from MongoDB)

The LibreChat exporter (`ghcr.io/virtuos/librechat_exporter:main`) scrapes data from MongoDB and exposes:

- `librechat_messages_total` - Total messages by model/provider
- `librechat_conversations_total` - Total conversations
- `librechat_users_total` - Total registered users
- `librechat_active_users_24h` - Active users in last 24 hours
- `librechat_tokens_total` - Total tokens used
- `librechat_prompt_tokens_total` - Prompt tokens by model/provider
- `librechat_completion_tokens_total` - Completion tokens by model/provider

### Host Metrics (Node Exporter)

- CPU usage (`node_cpu_seconds_total`)
- Memory usage (`node_memory_MemAvailable_bytes`, `node_memory_MemTotal_bytes`)
- Disk usage (`node_filesystem_avail_bytes`, `node_filesystem_size_bytes`)
- Network traffic (`node_network_receive_bytes_total`, `node_network_transmit_bytes_total`)

## Grafana

- **Datasource**: Prometheus (auto-provisioned)
- **Dashboard**: `soev.ai Monitoring` - auto-provisioned from `monitoring/grafana/dashboards/main.json`
- **URL**: `http://localhost/grafana/d/soevai-monitoring/soevai-monitoring`

### Dashboard Panels

1. **Service Health**: LibreChat exporter status
2. **Usage Stats**: Total messages, conversations, users, active users, tokens
3. **Model Metrics**: Messages and tokens by model/provider over time
4. **Tables**: Top models by message count and token usage
5. **System Metrics**: CPU, memory, disk, network

## Slack Alerts Setup

### Prerequisites

1. Slack workspace with Incoming Webhooks enabled
2. Webhook URL from your Slack workspace

### Create Slack Webhook

1. Go to your Slack workspace settings → Apps → Incoming Webhooks
2. Create a new webhook for the target channel (e.g., `#monitoring`)
3. Copy the webhook URL

### Configure Alertmanager

Replace the placeholder in `monitoring/alertmanager/slack_webhook`:

```bash
echo "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" > monitoring/alertmanager/slack_webhook
```

### Alert Rules

Alerts are defined in `monitoring/prometheus/alerts.yml`:

**Infrastructure Alerts:**
- `HighCPUUsage` - CPU > 80% for 2+ minutes
- `HighMemoryUsage` - Memory > 85% for 2+ minutes
- `DiskSpaceLow` - Disk > 85% for 2+ minutes

**LibreChat Alerts:**
- `LibreChatExporterDown` - Exporter unreachable for 2+ minutes
- `HighTokenUsageRate` - > 1M tokens in 1 hour
- `RapidMessageIncrease` - > 500 messages in 5 minutes (abuse detection)
- `NoRecentMessages` - No messages for 30 minutes

**Prometheus Alerts:**
- `PrometheusConfigReloadFailed` - Config reload failed
- `PrometheusTargetDown` - Any scrape target down

## Configuration Files

```
monitoring/
├── prometheus/
│   ├── prometheus-dev.yml      # Main Prometheus config for local dev
│   ├── alerts.yml              # Alert rules
│   ├── prometheus-prod.yml     # Production config
│   └── prometheus-ci.yml       # CI config
├── alertmanager/
│   ├── alertmanager.yml        # Alertmanager config (localhost URLs)
│   ├── alertmanager.yml.template  # Template with placeholders
│   └── slack_webhook           # Slack webhook URL (secret)
└── grafana/
    ├── dashboards/
    │   └── main.json           # soev.ai dashboard
    └── provisioning/
        ├── dashboards/         # Dashboard provisioning
        └── datasources/        # Datasource provisioning
```

## Prometheus Configuration

Key settings in `prometheus-dev.yml`:

- **Global scrape interval**: 15s
- **LibreChat exporter**: `metrics:8000` (60s interval, 30s timeout)
- **Node Exporter**: `node-exporter:9100` (30s interval)
- **Alertmanager**: `alertmanager:9093`

## Operations

### Start/Stop Services

```bash
# Start all services
docker-compose -f docker-compose.staging.yml up -d

# Stop all services
docker-compose -f docker-compose.staging.yml down

# Restart monitoring stack only
docker-compose -f docker-compose.staging.yml restart prometheus alertmanager grafana nginx
```

### Reload Configurations

```bash
# Reload Prometheus (without restart)
curl -X POST http://localhost/prometheus/-/reload

# Reload Alertmanager (without restart)
curl -X POST http://localhost/alertmanager/-/reload
```

### Check Status

```bash
# Container status
docker-compose -f docker-compose.staging.yml ps

# Prometheus targets
curl http://localhost/prometheus/api/v1/targets

# Active alerts
curl http://localhost/prometheus/api/v1/alerts

# Service logs
docker logs prometheus-local
docker logs alertmanager-local
docker logs grafana-local
docker logs librechat-metrics
docker logs nginx-local
```

### Test Alerts

```bash
# Check LibreChat exporter is scraping
curl http://localhost/metrics

# View raw metrics from exporter
docker exec librechat-metrics curl localhost:8000/metrics

# Stop exporter to trigger alert
docker stop librechat-metrics
# Wait ~2 minutes for LibreChatExporterDown alert

# Restore
docker start librechat-metrics
```

## Troubleshooting

### No Data in Dashboard

1. Check Prometheus targets: `http://localhost/prometheus/targets`
2. Verify LibreChat exporter is running: `docker logs librechat-metrics`
3. Check MongoDB connectivity from exporter
4. Verify network connectivity between containers

### Alerts Not Firing

1. Check Prometheus alerts page: `http://localhost/prometheus/alerts`
2. Verify Alertmanager is receiving alerts: `http://localhost/alertmanager/#/alerts`
3. Check Alertmanager logs: `docker logs alertmanager-local`
4. Verify Slack webhook URL is correct

### Grafana Not Loading

1. Check Grafana logs: `docker logs grafana-local`
2. Verify Prometheus datasource: Grafana → Settings → Data Sources
3. Check dashboard provisioning: `docker exec grafana-local ls /etc/grafana/dashboards/`

## Security Notes

For production deployments:

1. **Enable authentication** for Grafana (disable anonymous access)
2. **Restrict access** to monitoring endpoints via nginx
3. **Use HTTPS** for all traffic
4. **Store secrets** securely (use Docker secrets or external vault)
5. **Limit network access** to monitoring services

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [LibreChat Exporter](https://github.com/virtUOS/librechat_exporter)
- [Node Exporter](https://github.com/prometheus/node_exporter)
