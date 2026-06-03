#!/bin/bash

# Activate the virtual environment
source nnunet_env/bin/activate

# Export required paths using the current working directory as reference
export nnUNet_raw="$(pwd)/nnUNet_raw"
export nnUNet_preprocessed="$(pwd)/nnUNet_preprocessed"
export nnUNet_results="$(pwd)/nnUNet_results"

# Run the Python script
python "$(pwd)/check_and_convert.py"
python "$(pwd)/run_segmentations5.py" "$@"

