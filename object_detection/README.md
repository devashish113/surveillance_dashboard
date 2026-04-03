# EC2-3 — YOLO Object Detection Server

Flask server running YOLOv8 nano model for real-time object detection in surveillance frames. Flags suspicious objects (weapons, unattended bags) as threats.

## How It Works

1. Loads **YOLOv8 nano** model at startup (auto-downloads `yolov8n.pt` on first run)
2. Receives JPEG frame bytes via `POST /detect`
3. Runs `model.predict()` — detects objects with bounding boxes and confidence scores
4. Categorizes each detection:
   - 🔴 **Suspicious** (knife, scissors, baseball bat, backpack, handbag, suitcase) → `threat: true`
   - 🟡 **Interest** (person, car, truck, motorcycle, bicycle, cell phone, laptop) → logged
   - ⚪ **Other** (all remaining COCO classes) → logged
5. Returns structured JSON with all detections and threat status

## API Endpoints

| Method | Route      | Description                                    |
|--------|------------|------------------------------------------------|
| POST   | `/detect`  | Send JPEG frame → Get object detection results |
| GET    | `/health`  | Health check + config info                     |
| GET    | `/classes` | List all 80 COCO classes                       |

## Response Format

```json
{
  "objects": [
    {
      "class": "person",
      "confidence": 0.9134,
      "bbox": {"x1": 120.5, "y1": 80.2, "x2": 350.1, "y2": 460.8},
      "category": "interest"
    },
    {
      "class": "knife",
      "confidence": 0.8721,
      "bbox": {"x1": 200.0, "y1": 300.5, "x2": 280.3, "y2": 350.2},
      "category": "suspicious"
    }
  ],
  "threat": true,
  "suspicious_objects": ["knife: 0.8721"],
  "interest_objects": ["person: 0.9134"],
  "total_detections": 2,
  "suspicious_count": 1,
  "message": "⚠️ THREAT: Suspicious object(s) detected — knife: 0.8721",
  "server": "object_detection",
  "model": "yolov8n",
  "timestamp": "2026-04-02 00:00:00"
}
```

## Suspicious Objects (Trigger Alerts)

| Object | Reason |
|--------|--------|
| knife | Weapon |
| scissors | Sharp object |
| baseball bat | Potential weapon |
| backpack | Unattended bag threat |
| handbag | Unattended bag threat |
| suitcase | Unattended luggage |

## Local Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server (model auto-downloads on first run)
python app.py
```

## EC2 Deployment

```bash
# SSH into EC2 instance
ssh -i key.pem ubuntu@<ec2-ip>

# Install deps
sudo apt update
sudo apt install python3-pip -y
pip install -r requirements.txt

# Run server (background)
nohup python3 app.py &

# Or use Docker
docker build -t object-detection .
docker run -d -p 5003:5003 object-detection
```

## EC2 Security Group

Open **port 5003** for inbound TCP traffic.

## Tech Stack

- Python 3.11
- Flask
- YOLOv8 nano (Ultralytics)
- OpenCV (headless)
- NumPy

## Note

> Use `yolov8n.pt` (nano) on t2.micro to avoid OOM errors. CPU inference takes ~1-2 seconds per frame, which is acceptable for surveillance. The model file is ~6MB.
