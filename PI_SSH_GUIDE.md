# Raspberry Pi SSH Access Guide

**Complete instructions for SSH access to buz-pi via Tailscale VPN**

This guide is self-contained and can be copied to any project that needs to access the Raspberry Pi.

---

## Quick Reference

| Setting | Value |
|---------|-------|
| **Hostname** | `buz-pi` (Tailscale MagicDNS) |
| **User** | `buzzers123` |
| **SSH Key** | `~/.ssh/id_ed25519` |
| **Port** | 22 (default) |
| **Tailscale IP** | `100.76.143.123` |
| **Requires** | Tailscale VPN active on your machine |

**Basic SSH Command:**
```bash
ssh buzzers123@buz-pi
```

---

## Prerequisites

### 1. Tailscale VPN Must Be Running

The Pi is accessible only through Tailscale VPN. You must have Tailscale installed and running on your local machine.

**Check Tailscale status:**
```bash
# Windows (PowerShell/CMD)
tailscale status

# Linux/Mac
tailscale status
```

**Expected output when working:**
```
100.x.x.x    your-machine    your-email@   windows/linux/mac -
100.76.143.123    buz-pi          your-email@   linux   -
```

If `buz-pi` doesn't appear in the list:
- The Pi may be offline
- Tailscale may not be running on the Pi
- Your machine may not be connected to the same Tailnet

**Start Tailscale (if not running):**
```bash
# Windows - usually runs automatically, check system tray
# Or start from Start Menu: Tailscale

# Linux/Mac
sudo tailscale up
```

### 2. SSH Key Authentication

SSH uses key-based authentication (no password required).

**Your SSH key location:** `~/.ssh/id_ed25519`

The Pi already has your public key configured in `~/.ssh/authorized_keys`.

**Verify your SSH key exists:**
```bash
# Windows (PowerShell)
Test-Path ~\.ssh\id_ed25519

# Linux/Mac
ls ~/.ssh/id_ed25519
```

**If SSH key doesn't exist**, generate one:
```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

Then copy your public key to the Pi (one-time setup):
```bash
ssh-copy-id buzzers123@buz-pi
```

---

## Network Architecture

**Tailscale VPN** creates a secure mesh network between your devices:

- **Private IP addresses**: Each device gets a `100.x.x.x` IP address
- **MagicDNS**: Allows using hostnames (e.g., `buz-pi`) instead of IPs
- **Encrypted traffic**: All SSH traffic is encrypted end-to-end through Tailscale
- **No port forwarding**: No need to expose SSH to the internet

**How it works:**
1. Tailscale creates a virtual private network (VPN) between your devices
2. MagicDNS resolves `buz-pi` to the Tailscale IP (`100.76.143.123`)
3. SSH connects through this encrypted tunnel
4. No public IP exposure - your Pi stays invisible to the internet

---

## SSH Commands

### Basic Connection

**Interactive SSH session:**
```bash
ssh buzzers123@buz-pi
```

**Run a single command:**
```bash
ssh buzzers123@buz-pi 'hostname'
ssh buzzers123@buz-pi 'uptime'
ssh buzzers123@buz-pi 'df -h'
```

**Run multiple commands:**
```bash
ssh buzzers123@buz-pi 'cd ~/project && git pull && docker compose restart'
```

### File Transfer (SCP)

**Copy file TO Pi:**
```bash
scp local-file.txt buzzers123@buz-pi:/home/buzzers123/
scp -r local-directory/ buzzers123@buz-pi:/home/buzzers123/
```

**Copy file FROM Pi:**
```bash
scp buzzers123@buz-pi:/home/buzzers123/file.txt ./
scp -r buzzers123@buz-pi:/home/buzzers123/directory/ ./
```

### File Transfer (SFTP)

**Interactive SFTP session:**
```bash
sftp buzzers123@buz-pi
```

**SFTP commands:**
```
sftp> put local-file.txt
sftp> get remote-file.txt
sftp> ls
sftp> cd /home/buzzers123
sftp> exit
```

### Using Tailscale IP Directly

If MagicDNS isn't working, use the Tailscale IP:
```bash
ssh buzzers123@100.76.143.123
scp file.txt buzzers123@100.76.143.123:/home/buzzers123/
```

---

## SSH Config (Optional but Recommended)

Create or edit `~/.ssh/config` to simplify SSH commands:

**Windows:** `C:\Users\YourUsername\.ssh\config`  
**Linux/Mac:** `~/.ssh/config`

Add this entry:
```
Host buz-pi
    HostName buz-pi
    User buzzers123
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

**Now you can use:**
```bash
ssh buz-pi          # Instead of ssh buzzers123@buz-pi
scp file.txt buz-pi:/home/buzzers123/
```

---

## Troubleshooting

### "Connection refused" or "Host not found"

**1. Check Tailscale is running:**
```bash
tailscale status
```

**2. Verify Pi is online:**
Look for `buz-pi` in the Tailscale status output. If missing:
- Pi may be offline or rebooting
- Tailscale may not be running on Pi
- Check Pi's Tailscale status: `ssh buzzers123@100.76.143.123 'tailscale status'` (if you can reach it via IP)

**3. Try Tailscale IP directly:**
```bash
ssh buzzers123@100.76.143.123
```

**4. Check Tailscale dashboard:**
Visit https://login.tailscale.com/admin/machines
- Verify `buz-pi` is listed and online
- Check if both devices are on the same Tailnet

### "Permission denied (publickey)"

**1. Check SSH key exists:**
```bash
# Windows
Test-Path ~\.ssh\id_ed25519

# Linux/Mac
ls -la ~/.ssh/id_ed25519
```

**2. Verify SSH agent has your key:**
```bash
# Windows (PowerShell)
ssh-add -l

# Linux/Mac
ssh-add -l
```

**3. Add key to SSH agent:**
```bash
# Windows (PowerShell)
ssh-add ~\.ssh\id_ed25519

# Linux/Mac
ssh-add ~/.ssh/id_ed25519
```

**4. Test with verbose output:**
```bash
ssh -v buzzers123@buz-pi
```

This will show which keys are being tried and why authentication fails.

**5. Copy public key to Pi (if needed):**
```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub buzzers123@buz-pi
```

### "Network is unreachable"

**1. Tailscale not running:**
```bash
# Check status
tailscale status

# Start Tailscale
# Windows: Check system tray, or start from Start Menu
# Linux/Mac: sudo tailscale up
```

**2. Firewall blocking:**
- Check Windows Firewall isn't blocking Tailscale
- On Linux: `sudo ufw status` (should allow Tailscale)

### Connection is slow or timing out

**1. Check Tailscale connection quality:**
```bash
tailscale ping buz-pi
```

**2. Check network latency:**
```bash
ping buz-pi
# Or
ping 100.76.143.123
```

**3. Increase SSH timeout:**
Add to `~/.ssh/config`:
```
Host buz-pi
    ServerAliveInterval 60
    ServerAliveCountMax 3
    ConnectTimeout 30
```

### Local Network Fallback

If Tailscale is unavailable and you're on the same local network as the Pi:

**Find Pi's local IP:**
- Check your router's device list
- Or scan local network: `nmap -sn 192.168.1.0/24`

**Connect via local IP:**
```bash
ssh buzzers123@192.168.1.XXX  # Replace XXX with Pi's local IP
```

**Note:** This only works if:
- You're on the same local network
- Pi's firewall allows SSH from local network
- SSH is configured to accept connections from local IPs

---

## Common Operations

### Check Pi Status
```bash
ssh buzzers123@buz-pi 'uptime'
ssh buzzers123@buz-pi 'df -h'
ssh buzzers123@buz-pi 'free -h'
ssh buzzers123@buz-pi 'systemctl status buzbot-gateway'
```

### View Logs
```bash
# System service logs
ssh buzzers123@buz-pi 'journalctl -u buzbot-gateway -f'

# Docker logs
ssh buzzers123@buz-pi 'docker logs CONTAINER_NAME --tail 50'

# System logs
ssh buzzers123@buz-pi 'tail -f /var/log/syslog'
```

### Restart Services
```bash
# System service
ssh buzzers123@buz-pi 'sudo systemctl restart buzbot-gateway'

# Docker container
ssh buzzers123@buz-pi 'docker restart CONTAINER_NAME'

# Docker Compose
ssh buzzers123@buz-pi 'cd ~/project && docker compose restart'
```

### Update and Deploy
```bash
# Pull latest code and restart
ssh buzzers123@buz-pi 'cd ~/project && git pull origin master && sudo systemctl restart service-name'

# Docker Compose update
ssh buzzers123@buz-pi 'cd ~/project && docker compose pull && docker compose up -d'
```

### File Operations
```bash
# Edit file remotely
ssh buzzers123@buz-pi 'nano ~/project/config.yaml'

# View file
ssh buzzers123@buz-pi 'cat ~/project/config.yaml'

# Find files
ssh buzzers123@buz-pi 'find ~/project -name "*.log"'
```

---

## Security Notes

**Important Security Practices:**

1. **Never expose SSH directly to the internet** - Always use Tailscale VPN
2. **Use SSH key authentication** - Password authentication should be disabled
3. **Review connected devices** regularly in Tailscale dashboard
4. **Enable 2FA** on your Tailscale account
5. **Keep Tailscale updated** on all devices
6. **Use ACLs** in Tailscale to limit which devices can access the Pi

**Check SSH security on Pi:**
```bash
ssh buzzers123@buz-pi 'sudo grep -E "^PasswordAuthentication|^PermitRootLogin" /etc/ssh/sshd_config'
```

Should show:
```
PasswordAuthentication no
PermitRootLogin no
```

---

## Verification Checklist

After setting up SSH access, verify everything works:

- [ ] Tailscale is running on your machine
- [ ] `buz-pi` appears in `tailscale status` output
- [ ] Can SSH interactively: `ssh buzzers123@buz-pi`
- [ ] Can run remote commands: `ssh buzzers123@buz-pi 'hostname'`
- [ ] Can transfer files: `scp test.txt buzzers123@buz-pi:/tmp/`
- [ ] SSH config file created (optional but recommended)

**Test commands:**
```bash
# 1. Check Tailscale
tailscale status | grep buz-pi

# 2. Test SSH connection
ssh buzzers123@buz-pi 'echo "SSH working!"'

# 3. Test file transfer
echo "test" > test.txt
scp test.txt buzzers123@buz-pi:/tmp/
ssh buzzers123@buz-pi 'cat /tmp/test.txt'
ssh buzzers123@buz-pi 'rm /tmp/test.txt'
rm test.txt
```

---

## Additional Resources

- **Tailscale Dashboard:** https://login.tailscale.com/admin
- **Tailscale Documentation:** https://tailscale.com/kb/
- **SSH Documentation:** https://www.openssh.com/manual.html

---

## Exporting to Another Project

To use this guide in another project:

1. **Copy this file** to the target project (e.g., `.claude/pi-ssh.md` or `docs/pi-ssh.md`)
2. **Update project-specific sections** if needed (e.g., service names, directories)
3. **Add a reference** in the project's main documentation (e.g., `CLAUDE.md`):

```markdown
## Pi Access (SSH)
```bash
ssh buzzers123@buz-pi
```

| Setting | Value |
|---------|-------|
| **Host** | `buz-pi` (Tailscale hostname) |
| **User** | `buzzers123` |
| **Auth** | SSH key |

> **Full SSH documentation:** See [PI_SSH_GUIDE.md](PI_SSH_GUIDE.md) for complete reference including troubleshooting.
```

4. **Commit the file** - Don't add to `.gitignore`. This documentation should be version controlled so future Claude sessions can access it.

---

**Last Updated:** 2026-02-07  
**Pi Hostname:** buz-pi  
**Tailscale IP:** 100.76.143.123
