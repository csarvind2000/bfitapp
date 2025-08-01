FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime

WORKDIR /app

COPY . .

RUN pip install --upgrade pip && pip install -r requirements.txt --no-cache-dir 

CMD ["python", "-u", "app.py"]