#!/bin/bash
set -euo pipefail

scp requirements.txt ovd:/app/requirements.txt
scp server.py ovd:/app/server.py
scp -r static ovd:/app/static
scp -r templates ovd:/app/templates

echo 'installing python deps'
ssh ovd 'pip3 install -r /app/requirements.txt'

echo 'stopping ovd.service'
ssh ovd 'service ovd stop || true'
scp ops/ovd.service ovd:/etc/systemd/system/ovd.service
ssh ovd "sed -i 's/%HCAPTCHA%/$HCAPTCHA_SECRET/' /etc/systemd/system/ovd.service"
ssh ovd 'systemctl daemon-reload'
echo 'starting ovd.service'
ssh ovd 'service ovd start'

scp ops/nginx.conf ovd:/etc/nginx/sites-enabled/ovd
ssh ovd 'chmod -R a+r /etc/nginx/sites-enabled && service nginx restart'