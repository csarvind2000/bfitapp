If you are using docker server, run the following command:
    UID="$(id -u)" GID="$(id -g)" docker compose -f docker-compose.yaml -f docker-compose.dev.yaml down


If you only want to run the flask app:

Step1: Create a virtual enviroment
    python3 -m venv venv
    source venv/bin/activate   # On Windows: venv\Scripts\activate

Step2: Install all dependancies 
    pip install -r requirements.txt
    
Step3: Install/ prepare NNUNET Models

Step4: export all paths
    export nnUNet_raw="/path/to/nnUNet_raw"
    export nnUNet_preprocessed="/path/to/nnUNet_preprocessed"
    export nnUNet_results="/path/to/nnUNet/nnunet_results"

Step5: Run the Flask App
    python app.py
