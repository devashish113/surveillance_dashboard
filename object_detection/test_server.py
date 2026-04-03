"""
Test script for YOLO Object Detection Server.
Sends sample frames to the server and verifies responses.
Run the server first: python app.py
"""

import requests
import cv2
import numpy as np

SERVER_URL = "http://localhost:5003"


def create_blank_frame(width=640, height=480):
    """Create a blank frame with no objects."""
    frame = np.full((height, width, 3), (80, 80, 80), dtype=np.uint8)
    _, buffer = cv2.imencode('.jpg', frame)
    return buffer.tobytes()


def capture_webcam_frame():
    """Capture a single frame from the webcam (for real object testing)."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        return None
    ret, frame = cap.read()
    cap.release()
    if not ret:
        return None
    _, buffer = cv2.imencode('.jpg', frame)
    return buffer.tobytes()


def test_health():
    """Test health check endpoint."""
    print("=" * 50)
    print("🔍 Testing /health endpoint...")
    resp = requests.get(f"{SERVER_URL}/health")
    data = resp.json()
    print(f"   Status: {resp.status_code}")
    print(f"   Server: {data['server']}")
    print(f"   Model: {data['model']}")
    print(f"   Confidence threshold: {data['confidence_threshold']}")
    print(f"   Suspicious list: {data['suspicious_objects_list']}")
    assert resp.status_code == 200
    print("   ✅ Health check passed!\n")


def test_classes():
    """Test classes listing endpoint."""
    print("=" * 50)
    print("🔍 Testing /classes endpoint...")
    resp = requests.get(f"{SERVER_URL}/classes")
    data = resp.json()
    print(f"   Total COCO classes: {data['total_classes']}")
    print(f"   Suspicious: {data['suspicious']}")
    print(f"   Interest: {data['interest']}")
    assert data["total_classes"] == 80
    print("   ✅ Classes listing passed!\n")


def test_blank_frame():
    """Send a blank frame — should detect no objects."""
    print("=" * 50)
    print("🔍 Testing BLANK FRAME (no objects)...")

    frame = create_blank_frame()
    resp = requests.post(f"{SERVER_URL}/detect", data=frame,
                         headers={"Content-Type": "image/jpeg"})
    result = resp.json()

    print(f"   Total detections: {result['total_detections']}")
    print(f"   Threat: {result['threat']}")
    print(f"   Message: {result['message']}")
    assert result["threat"] == False
    print("   ✅ Blank frame test passed!\n")


def test_webcam_detection():
    """Capture a frame from webcam and run object detection."""
    print("=" * 50)
    print("🔍 Testing WEBCAM DETECTION (live capture)...")

    frame = capture_webcam_frame()
    if frame is None:
        print("   ⚠️  Could not open webcam — skipping test")
        return

    resp = requests.post(f"{SERVER_URL}/detect", data=frame,
                         headers={"Content-Type": "image/jpeg"})
    result = resp.json()

    print(f"   Total detections: {result['total_detections']}")
    print(f"   Threat: {result['threat']}")
    print(f"   Message: {result['message']}")

    if result["total_detections"] > 0:
        print(f"\n   Detected objects:")
        for obj in result["objects"]:
            if obj["category"] == "suspicious":
                icon = "🔴"
            elif obj["category"] == "interest":
                icon = "🟡"
            else:
                icon = "⚪"
            print(f"   {icon} {obj['class']} ({obj['confidence']}) [{obj['category']}]")

    if result["suspicious_count"] > 0:
        print(f"\n   ⚠️  Suspicious: {result['suspicious_objects']}")

    print("   ✅ Webcam detection test completed!\n")


def test_empty_body():
    """Send empty request body — should return 400."""
    print("=" * 50)
    print("🔍 Testing EMPTY BODY (error handling)...")

    resp = requests.post(f"{SERVER_URL}/detect", data=b"",
                         headers={"Content-Type": "image/jpeg"})
    print(f"   Status: {resp.status_code}")
    assert resp.status_code == 400
    print("   ✅ Empty body error handling passed!\n")


if __name__ == "__main__":
    print("\n🚀 YOLO Object Detection Server — Test Suite")
    print("=" * 50)
    print(f"   Target: {SERVER_URL}\n")

    try:
        test_health()
        test_classes()
        test_empty_body()
        test_blank_frame()
        test_webcam_detection()

        print("=" * 50)
        print("🎉 ALL TESTS PASSED!")
        print("=" * 50)

    except requests.ConnectionError:
        print("❌ Could not connect to server. Make sure it's running:")
        print("   python app.py")
    except AssertionError as e:
        print(f"❌ Test failed: {e}")
    except Exception as e:
        print(f"❌ Error: {e}")
