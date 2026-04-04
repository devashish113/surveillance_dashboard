import os
import json
import boto3
import urllib3
import time
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO

from botocore.config import Config

app = Flask(__name__)
# Enable CORS just in case for local testing
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Initialize AWS S3 Client with EXPLICIT Mumbai Region to fix Presigned URL Signature errors
s3 = boto3.client('s3', region_name='ap-south-1', config=Config(signature_version='s3v4'))
BUCKET = "surveillance-frames"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/upload-face', methods=['POST'])
def upload_face():
    """
    Phase 13: Face target uploader.
    Saves image to known_faces in S3 and instantly pings EC2 Face Server to hot-reload.
    """
    if 'face_image' not in request.files or 'person_name' not in request.form:
        return jsonify({"error": "Missing image or name"}), 400
    
    file = request.files['face_image']
    name = request.form['person_name'].strip().replace(" ", "_")
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
        
    # Append timestamp to allow multiple angles of the same person
    s3_key = f"known_faces/{name}_{int(time.time())}.jpg"
    try:
        s3.put_object(Bucket=BUCKET, Key=s3_key, Body=file.read(), ContentType=file.content_type)
        
        # Hot-Reload EC2 Face Server
        EC2_FACE_URL = "http://13.204.185.155:5002/reload"
        http = urllib3.PoolManager()
        try:
            http.request("POST", EC2_FACE_URL, timeout=3.0)
        except Exception as e:
            print(f"Warning: S3 uploaded but failed to reload EC2: {e}")
            
        return jsonify({"status": "success", "message": f"{name} uploaded and deployed."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/webhook', methods=['POST'])
def webhook_listener():
    """
    AWS Lambda hits this instantly when a threat happens.
    We fetch the latest alerts and push via Socket.IO immediately.
    """
    try:
        data = request.json or {}
        # We can optimize this by only parsing the new alert, but for simplicity we'll just push the 15 latest
        alerts = fetch_alerts_from_s3()
        socketio.emit('new_alerts_push', alerts)
        return jsonify({"status": "pushed"}), 200
    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/alerts')
def api_get_alerts():
    return jsonify(fetch_alerts_from_s3())

def fetch_alerts_from_s3():
    """
    Scans the S3 bucket for the latest JSON threat alerts,
    parses them, and dynamically generates temporary pre-signed 
    URLs for the snapshot images so the UI can safely access them.
    """
    try:
        response = s3.list_objects_v2(Bucket=BUCKET, Prefix="alerts/")
        if 'Contents' not in response:
            return jsonify([])
        
        objects = response['Contents']
        # Sort objects by newest first
        objects.sort(key=lambda obj: obj['LastModified'], reverse=True)
        # Grab only the 15 most recent alerts to prevent massive loading times
        objects = objects[:15]

        alerts = []
        for obj in objects:
            if obj['Size'] == 0: continue
            
            # Download and read the specific JSON file containing the AI assessment
            file_obj = s3.get_object(Bucket=BUCKET, Key=obj['Key'])
            try:
                data = json.loads(file_obj['Body'].read().decode('utf-8'))
            except Exception:
                continue
            
            # Security Magic: Since your camera frames are securely locked in S3 (Private),
            # the UI cannot load them directly via <img src="..." />
            # We must generate an impermanent (1-hour) authorized token URL precisely for the UI!
            if 'frame_key' in data:
                img_url = s3.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': BUCKET, 'Key': data['frame_key']},
                    ExpiresIn=3600
                )
                data['snapshot_url'] = img_url
            
            # Map object key for uniqueness
            data['id'] = obj['Key']
            alerts.append(data)

        return alerts

    except Exception as e:
        print(f"Error fetching alerts: {e}")
        return []

if __name__ == '__main__':
    print("=" * 50)
    print("🚀 AEGIS COMMAND CENTER — WebSocket Backend Initialized")
    print("📍 Available at: http://localhost:5050")
    print("=" * 50)
    socketio.run(app, host='0.0.0.0', port=5050, allow_unsafe_werkzeug=True)
