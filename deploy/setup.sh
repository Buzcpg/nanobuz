#!/bin/bash
# First-time NanoClaw setup on Raspberry Pi
# Run this script once after copying deploy files to ~/nanoclaw

set -e

NANOCLAW_DIR="${HOME}/nanoclaw"

echo "=== NanoClaw Pi Setup ==="
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed"
    echo "Install with: curl -fsSL https://get.docker.com | sh"
    echo "Then: sudo usermod -aG docker \$USER && newgrp docker"
    exit 1
fi

# Check docker access
if ! docker info &> /dev/null; then
    echo "ERROR: Cannot access Docker. Make sure you're in the docker group:"
    echo "  sudo usermod -aG docker \$USER"
    echo "  newgrp docker"
    exit 1
fi

echo "Docker: OK"

# Create directory structure
echo "Creating directories..."
mkdir -p "${NANOCLAW_DIR}"/{store/auth,data/sessions,data/ipc,groups/main,groups/global,logs}

cd "${NANOCLAW_DIR}"

# Check for .env
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo ""
        echo "No .env file found. Please create one:"
        echo "  cp .env.example .env"
        echo "  nano .env  # Add your ANTHROPIC_API_KEY"
        exit 1
    else
        echo "ERROR: No .env or .env.example found"
        exit 1
    fi
fi

# Check for required env vars
if ! grep -q "ANTHROPIC_API_KEY\|CLAUDE_CODE_OAUTH_TOKEN" .env 2>/dev/null; then
    echo "ERROR: .env must contain ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"
    exit 1
fi

echo "Environment: OK"

# Login to GitHub Container Registry
echo ""
echo "Logging into GitHub Container Registry..."
echo "You'll need a GitHub Personal Access Token with 'read:packages' scope"
echo "Create one at: https://github.com/settings/tokens"
echo ""
read -p "GitHub username: " GH_USER
read -sp "GitHub token: " GH_TOKEN
echo ""

echo "${GH_TOKEN}" | docker login ghcr.io -u "${GH_USER}" --password-stdin

echo "Registry login: OK"

# Pull images
echo ""
echo "Pulling Docker images (this may take a while on first run)..."
docker compose pull

echo "Images: OK"

# First run - need to authenticate WhatsApp
echo ""
echo "=== WhatsApp Authentication ==="
echo "Starting NanoClaw to scan QR code..."
echo "Press Ctrl+C after scanning the QR code and confirming connection."
echo ""

docker compose up

# If we get here, user pressed Ctrl+C
echo ""
echo "=== Installing systemd service ==="
echo "This will make NanoClaw start automatically on boot."
echo ""

sudo cp nanoclaw.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable nanoclaw
sudo systemctl start nanoclaw

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "NanoClaw is now running as a system service."
echo ""
echo "Useful commands:"
echo "  View logs:    sudo journalctl -u nanoclaw -f"
echo "  Restart:      sudo systemctl restart nanoclaw"
echo "  Stop:         sudo systemctl stop nanoclaw"
echo "  Update:       cd ~/nanoclaw && ./update.sh"
echo ""
