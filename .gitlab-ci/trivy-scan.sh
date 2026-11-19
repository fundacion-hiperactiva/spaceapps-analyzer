#!/bin/sh
set -eu

# Trivy Scan Script for Corvus Cornix
# This script performs both image scanning and filesystem scanning.

e1_version="$(sh .gitlab-ci/resolve-version.sh e1)"
IMAGE_NAME="${1:-$CI_REGISTRY_IMAGE:${e1_version}-$CI_COMMIT_SHORT_SHA}"

echo "INFO: Starting Trivy Filesystem Scan..."
trivy fs --exit-code 0 --severity MEDIUM,HIGH,CRITICAL .

if command -v docker >/dev/null 2>&1; then
    echo "INFO: Checking for container image: $IMAGE_NAME"
    # Wait up to 30 seconds for docker daemon to be ready if DOCKER_HOST is set
    if [ -n "${DOCKER_HOST:-}" ]; then
        echo "INFO: Waiting for Docker daemon at $DOCKER_HOST..."
        for i in $(seq 1 30); do
            if docker info >/dev/null 2>&1; then
                echo "INFO: Docker daemon is ready."
                break
            fi
            sleep 1
        done
    fi

   if docker pull "$IMAGE_NAME"; then
    echo "INFO: Starting Trivy Image Scan for $IMAGE_NAME..."
    trivy image --exit-code 0 --severity MEDIUM,HIGH,CRITICAL --format json --output trivy-report.json "$IMAGE_NAME"
    trivy image --severity MEDIUM,HIGH,CRITICAL --format table "$IMAGE_NAME"
    else
        echo "WARNING: Container image $IMAGE_NAME not found or Docker daemon unreachable; skipping image scan."
        # Create an empty json report ONLY if it doesn't exist to avoid artifact errors
        if [ ! -f trivy-report.json ]; then
            echo '{}' > trivy-report.json
        fi
    fi
else
    echo "WARNING: Docker not available; skipping image scan."
    if [ ! -f trivy-report.json ]; then
        echo '{}' > trivy-report.json
    fi
fi

echo "INFO: Trivy scan completed."
