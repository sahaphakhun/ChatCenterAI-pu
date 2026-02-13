#!/bin/bash

# Docker Build and Push Script for ChatCenter-AI
# Usage: ./docker-deploy.sh [version]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="xianta456/chatcenter-ai"
VERSION=${1:-$(node -p "require('./package.json').version")}

echo -e "${BLUE}🐳 ChatCenter-AI Docker Build & Push${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "Image Name: ${GREEN}${IMAGE_NAME}${NC}"
echo -e "Version: ${GREEN}${VERSION}${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if logged in to Docker Hub
if ! docker info | grep -q "Username"; then
    echo -e "${YELLOW}⚠️  Not logged in to Docker Hub. Please login:${NC}"
    docker login
fi

echo -e "${BLUE}📦 Building Docker image...${NC}"
docker build -t ${IMAGE_NAME}:${VERSION} -t ${IMAGE_NAME}:latest .

echo ""
echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo ""

# List the images
echo -e "${BLUE}📋 Built images:${NC}"
docker images | grep ${IMAGE_NAME} | head -2

echo ""
echo -e "${BLUE}🚀 Pushing to Docker Hub...${NC}"

# Push both tags
docker push ${IMAGE_NAME}:${VERSION}
docker push ${IMAGE_NAME}:latest

echo ""
echo -e "${GREEN}✅ Successfully pushed to Docker Hub!${NC}"
echo ""
echo -e "${BLUE}📍 Your images are now available at:${NC}"
echo -e "   • ${GREEN}https://hub.docker.com/r/${IMAGE_NAME}${NC}"
echo -e "   • ${GREEN}docker pull ${IMAGE_NAME}:${VERSION}${NC}"
echo -e "   • ${GREEN}docker pull ${IMAGE_NAME}:latest${NC}"
echo ""
echo -e "${BLUE}🎉 Deployment completed!${NC}"
