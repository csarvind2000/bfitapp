#!/usr/bin/env bash

mkdir -p docker_dist

if [[ "$#" -eq 0 ]]; 
then
    for img in $(docker compose config --images); 
    do
        fname=$(echo $img | tr '/' '-' | tr ':' '_')
        echo "Saving docker image $fname..."
        docker save $img | gzip > docker_dist/$fname.tar.gz
        echo -e "\rDone.\n"
    done
    echo "Completed exporting images for all services."
    exit 0
fi

for img in "$@";
do
    fname=$(echo $img | tr '/' '-' | tr ':' '_')
    echo "Saving docker image $fname..."
    docker save $img | gzip > docker_dist/$fname.tar.gz
    echo -e "\rDone.\n"
done


