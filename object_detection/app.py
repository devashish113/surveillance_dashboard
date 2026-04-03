from flask import Flask, request, jsonify
from ultralytics import YOLO
import cv2
import numpy as np
from datetime import datetime

app = Flask(__name__)

print("📦 Loading YOLOv8 nano model...")
model = YOLO("yolov8n.pt")
print("✅ Model loaded successfully!")

CONFIDENCE_THRESHOLD = 0.40  
SUSPICIOUS_OBJECTS = {
    "knife",
    "scissors",
    "baseball bat",
    "backpack",
    "handbag",
    "suitcase",
}

OBJECTS_OF_INTEREST = {
    "person",
    "car",
    "truck",
    "motorcycle",
    "bicycle",
    "cell phone",
    "laptop",
}

# All trackable objects = suspicious + interest
TRACKABLE_OBJECTS = SUSPICIOUS_OBJECTS | OBJECTS_OF_INTEREST


def detect_objects(frame_bytes):
    """
    Run YOLOv8 inference on a frame and return detected objects.

    Steps:
        1. Decode JPEG bytes to numpy array
        2. Run model.predict() on the frame
        3. Extract class names, confidence scores, and bounding boxes
        4. Classify detections as suspicious (threat) or normal
        5. Return structured results

    Returns:
        dict: {objects, threat, suspicious_objects, total_detections, ...}
    """
    # Decode JPEG bytes to numpy array
    nparr = np.frombuffer(frame_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        return {
            "objects": [],
            "threat": False,
            "suspicious_objects": [],
            "total_detections": 0,
            "message": "Failed to decode frame"
        }

    # Run YOLOv8 inference with Tracking
    results = model.track(
        source=frame,
        persist=True,
        conf=CONFIDENCE_THRESHOLD,
        verbose=False  # Suppress console output per frame
    )

    # Parse results
    all_detections = []
    suspicious_detected = []
    interest_detected = []

    for result in results:
        boxes = result.boxes

        if boxes is None or len(boxes) == 0:
            continue

        for i in range(len(boxes)):
            # Get class name and confidence
            class_id = int(boxes.cls[i].item())
            class_name = model.names[class_id]
            confidence = round(float(boxes.conf[i].item()), 4)
            
            # Get Tracking ID
            track_id = int(boxes.id[i].item()) if boxes.id is not None else None
            label = f"{class_name} #{track_id}" if track_id is not None else class_name

            # Get bounding box coordinates (x1, y1, x2, y2)
            bbox = boxes.xyxy[i].tolist()
            bbox = [round(coord, 1) for coord in bbox]

            detection = {
                "class": class_name,
                "confidence": confidence,
                "track_id": track_id,
                "bbox": {
                    "x1": bbox[0],
                    "y1": bbox[1],
                    "x2": bbox[2],
                    "y2": bbox[3]
                }
            }

            all_detections.append(detection)

            # Categorize detection
            if class_name in SUSPICIOUS_OBJECTS:
                detection["category"] = "suspicious"
                suspicious_detected.append(f"{label}: {confidence}")
            elif class_name in OBJECTS_OF_INTEREST:
                detection["category"] = "interest"
                interest_detected.append(f"{label}: {confidence}")
            else:
                detection["category"] = "other"

    # Determine threat level
    threat = len(suspicious_detected) > 0

    # Build summary message
    if threat:
        message = f"⚠️ THREAT: Suspicious object(s) detected — {', '.join(suspicious_detected)}"
    elif len(all_detections) > 0:
        message = f"Detected {len(all_detections)} object(s), no threats"
    else:
        message = "No objects detected in frame"

    return {
        "objects": all_detections,
        "threat": threat,
        "suspicious_objects": suspicious_detected,
        "interest_objects": interest_detected,
        "total_detections": len(all_detections),
        "suspicious_count": len(suspicious_detected),
        "message": message
    }


# ─── API Routes ───

@app.route("/detect", methods=["POST"])
def detect():
    """
    POST /detect
    Receives JPEG frame bytes in request body.
    Returns YOLO object detection results as JSON.
    """
    try:
        frame_bytes = request.get_data()

        if not frame_bytes:
            return jsonify({
                "error": "No frame data received",
                "objects": [],
                "threat": False
            }), 400

        # Run object detection
        result = detect_objects(frame_bytes)

        # Add metadata
        result["server"] = "object_detection"
        result["model"] = "yolov8n"
        result["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        return jsonify(result), 200

    except Exception as e:
        return jsonify({
            "error": str(e),
            "objects": [],
            "threat": False,
            "server": "object_detection"
        }), 500


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "server": "object_detection",
        "model": "yolov8n",
        "port": 5003,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "suspicious_objects_list": sorted(list(SUSPICIOUS_OBJECTS)),
        "interest_objects_list": sorted(list(OBJECTS_OF_INTEREST)),
        "total_coco_classes": len(model.names),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }), 200


@app.route("/classes", methods=["GET"])
def list_classes():
    """List all 80 COCO classes the model can detect."""
    return jsonify({
        "total_classes": len(model.names),
        "all_classes": model.names,
        "suspicious": sorted(list(SUSPICIOUS_OBJECTS)),
        "interest": sorted(list(OBJECTS_OF_INTEREST)),
        "server": "object_detection"
    }), 200


if __name__ == "__main__":
    print("=" * 50)
    print("🟡 EC2-3 — YOLO Object Detection Server")
    print("=" * 50)
    print(f"📡 Running on port 5003")
    print(f"🧠 Model: YOLOv8 nano (yolov8n.pt)")
    print(f"🎯 Confidence threshold: {CONFIDENCE_THRESHOLD}")
    print(f"🔴 Suspicious objects: {sorted(SUSPICIOUS_OBJECTS)}")
    print(f"🟡 Objects of interest: {sorted(OBJECTS_OF_INTEREST)}")
    print(f"🔗 POST /detect   → Send JPEG frame for object detection")
    print(f"🔗 GET  /health   → Health check")
    print(f"🔗 GET  /classes  → List all detectable classes")
    print("=" * 50)

    app.run(host="0.0.0.0", port=5003, debug=False)
