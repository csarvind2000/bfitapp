FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime

WORKDIR /app

COPY . .

RUN pip install --upgrade pip && pip install -r requirements.txt --no-cache-dir 

COPY ./utils/nnUNetTrainerTopK10Loss_33os_1000epochs.py /opt/conda/lib/python3.1/site-packages/nnunetv2/training/nnUNetTrainer/nnUNetTrainerTopK10Loss_33os_1000epochs.py
COPY ./utils/nnUNetTrainerTopK10Loss_33os_1000epochs.py /opt/conda/lib/python3.11/site-packages/nnunetv2/training/nnUNetTrainer/nnUNetTrainerTopK10Loss_33os_1000epochs.py

CMD ["python", "-u", "app.py"]