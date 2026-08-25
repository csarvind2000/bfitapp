#!/usr/bin/env bash

export VERSION=$(cat .bfitapp-version)

docker compose build "$@"