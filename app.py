import os
import json
import boto3
from flask import Flask, render_template, jsonify
from flask_cors import CORS

from botocore.config import Config

app = Flask(__name__)
# Enable CORS just in case for local testing
CORS(app)

# Initialize AWS S3 Client with EXPLICIT Mumbai Region to fix Presigned URL Signature errors
s3 = boto3.client('s3', region_name='ap-south-1', config=Config(signature_version='s3v4'))
BUCKET = "surveillance-frames"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/alerts')
def get_alerts():
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

        return jsonify(alerts)

    except Exception as e:
        print(f"Error fetching alerts: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("=" * 50)
    print("🚀 AEGIS COMMAND CENTER — Backend Initializing")
    print("📍 Available at: http://localhost:5050")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5050, debug=True)
