# ─────────────────────────────────────────────────────────────────────────────
# VendorGuard — App Deployment
#
# Resources:
#   EC2 t3.micro   — FastAPI backend (uvicorn + systemd)
#   Amplify App    — Next.js frontend (auto-deploy on git push)
#   Security Group — allows 8000 (API) and 22 (SSH) inbound
#
# Pre-requisites:
#   1. An EC2 key pair already created in AWS console
#      → set var.ec2_key_name to its name
#   2. Your GitHub repo connected to Amplify
#      → set var.github_repo and var.github_branch
#   3. A GitHub personal access token with repo scope
#      → set var.github_token (sensitive)
#
# Deploy:
#   cd infra && terraform init && terraform apply
#
# After deploy:
#   - SSH into EC2:  ssh -i ~/.ssh/<key>.pem ubuntu@<ec2_public_ip output>
#   - Run setup:     bash /tmp/setup.sh   (cloud-init does this automatically)
#   - Frontend URL:  <amplify_url output>
# ─────────────────────────────────────────────────────────────────────────────

# ── Variables ─────────────────────────────────────────────────────────────────

variable "ec2_key_name" {
  description = "Name of the EC2 key pair for SSH access (create in AWS console first)"
}

variable "github_repo" {
  description = "GitHub repo URL e.g. https://github.com/org/vendorguard"
}

variable "github_branch" {
  description = "Branch to auto-deploy"
  default     = "dev"
}

variable "github_token" {
  description = "GitHub personal access token (repo scope) — used by Amplify"
  sensitive   = true
}

variable "app_domain" {
  description = "Custom domain (optional). Leave empty to use Amplify's default *.amplifyapp.com"
  default     = ""
}

# ── Data — latest Ubuntu 24.04 AMI ───────────────────────────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── Security Group ────────────────────────────────────────────────────────────

resource "aws_security_group" "backend" {
  name        = "vg-backend-sg"
  description = "VendorGuard FastAPI backend"

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH"
  }

  # FastAPI
  ingress {
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "FastAPI / uvicorn"
  }

  # All outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "vg-backend-sg" }
}

# ── EC2 Instance ──────────────────────────────────────────────────────────────

resource "aws_instance" "backend" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.micro"
  key_name               = var.ec2_key_name
  vpc_security_group_ids = [aws_security_group.backend.id]

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  # Cloud-init: install deps, clone repo, create systemd service, start API
  user_data = <<-USERDATA
    #!/bin/bash
    set -e
    apt-get update -y
    apt-get install -y python3-pip python3-venv git

    # Clone repo
    git clone ${var.github_repo} /home/ubuntu/vendorguard
    chown -R ubuntu:ubuntu /home/ubuntu/vendorguard

    # Python venv + deps
    python3 -m venv /home/ubuntu/venv
    /home/ubuntu/venv/bin/pip install --upgrade pip
    /home/ubuntu/venv/bin/pip install -r /home/ubuntu/vendorguard/requirements.txt
    /home/ubuntu/venv/bin/pip install gunicorn

    # .env file from SSM — pull all params at first boot
    apt-get install -y awscli
    cat > /home/ubuntu/vendorguard/.env.local << 'ENVEOF'
    DB_HOST=${var.db_host}
    DB_PORT=${var.db_port}
    DB_NAME=${var.db_name}
    DB_USER=${var.db_user}
    DB_PASSWORD=${var.db_password}
    JWT_SECRET=${var.jwt_secret}
    GMAIL_SENDER=${var.smtp_user}
    GMAIL_APP_PASSWORD=${var.smtp_password}
    DRY_RUN_EMAIL=false
    CORS_ORIGINS=http://localhost:3000,https://${aws_amplify_app.frontend.default_domain}
    USE_LOCAL_STORAGE=false
    AWS_REGION=${var.aws_region}
    ENVEOF

    # Systemd service
    cat > /etc/systemd/system/vendorguard.service << 'SVCEOF'
    [Unit]
    Description=VendorGuard FastAPI
    After=network.target

    [Service]
    User=ubuntu
    WorkingDirectory=/home/ubuntu/vendorguard
    EnvironmentFile=/home/ubuntu/vendorguard/.env.local
    ExecStart=/home/ubuntu/venv/bin/gunicorn backend.api.main:app \
      -w 2 -k uvicorn.workers.UvicornWorker \
      --bind 0.0.0.0:8000 \
      --timeout 120 \
      --access-logfile - \
      --error-logfile -
    Restart=always
    RestartSec=5

    [Install]
    WantedBy=multi-user.target
    SVCEOF

    # Deploy script — run this after every git push to update the backend
    cat > /home/ubuntu/deploy.sh << 'DEPLOYEOF'
    #!/bin/bash
    cd /home/ubuntu/vendorguard
    git pull origin ${var.github_branch}
    /home/ubuntu/venv/bin/pip install -r requirements.txt --quiet
    sudo systemctl restart vendorguard
    echo "Deployed at $(date)"
    DEPLOYEOF
    chmod +x /home/ubuntu/deploy.sh

    systemctl daemon-reload
    systemctl enable vendorguard
    systemctl start vendorguard
  USERDATA

  tags = { Name = "vg-backend" }
}

# ── Elastic IP — stable address that survives reboots ─────────────────────────

resource "aws_eip" "backend" {
  instance = aws_instance.backend.id
  domain   = "vpc"
  tags     = { Name = "vg-backend-eip" }
}

# ── Amplify App — Next.js frontend ───────────────────────────────────────────

resource "aws_amplify_app" "frontend" {
  name         = "vendorguard"
  repository   = var.github_repo
  access_token = var.github_token

  build_spec = <<-BUILDSPEC
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
  BUILDSPEC

  environment_variables = {
    NEXT_PUBLIC_API_URL = "http://${aws_eip.backend.public_ip}:8000/api"
  }

  # Redirect all paths to Next.js (SPA-style)
  custom_rule {
    source = "/<*>"
    target = "/index.html"
    status = "404-200"
  }

  tags = { Name = "vendorguard-frontend" }
}

# ── Amplify Branch — auto-deploy on push to main ─────────────────────────────

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = var.github_branch

  # Trigger build automatically on every git push
  enable_auto_build = true

  environment_variables = {
    NEXT_PUBLIC_API_URL = "http://${aws_eip.backend.public_ip}:8000/api"
  }

  tags = { Name = "vendorguard-main" }
}

# ── SSM Parameter — store EC2 IP so other scripts can find backend ────────────

resource "aws_ssm_parameter" "backend_url" {
  name  = "${var.ssm_prefix}/backend_url"
  type  = "String"
  value = "http://${aws_eip.backend.public_ip}:8000/api"
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "ec2_public_ip" {
  value       = aws_eip.backend.public_ip
  description = "SSH and API host — ssh ubuntu@<ip>"
}

output "api_url" {
  value       = "http://${aws_eip.backend.public_ip}:8000/api"
  description = "FastAPI base URL"
}

output "amplify_url" {
  value       = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.frontend.default_domain}"
  description = "Live frontend URL"
}

output "deploy_command" {
  value       = "ssh ubuntu@${aws_eip.backend.public_ip} 'bash /home/ubuntu/deploy.sh'"
  description = "Run this after a git push to update the backend"
}
