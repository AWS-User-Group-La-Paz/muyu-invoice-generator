packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.8"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

source "amazon-ebs" "muyu-ubuntu" {
  ami_name      = "muyu-invoice-generator-{{timestamp}}"
  instance_type = "t3.micro"
  region        = "us-east-1"
  source_ami_filter {
    filters = {
      name                = "ubuntu/images/*ubuntu-noble-24.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"] # Canonical
  }
  ssh_username = "ubuntu"
}

build {
  name = "muyu-invoice"
  sources = [
    "source.amazon-ebs.muyu-ubuntu"
  ]

  provisioner "file" {
    source      = "provisioning/muyu-invoice.service"
    destination = "/tmp/muyu-invoice.service"
  }

  provisioner "file" {
    source      = "provisioning/nginx.conf"
    destination = "/tmp/nginx.conf"
  }

  provisioner "shell" {
    script = "provisioning/setup.sh"
  }
}
