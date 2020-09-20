import os
import random
import uuid
import datetime
import time
from typing import List, Optional
from fastapi import FastAPI, Request, Form, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from databases import Database
import httpx

HCAPTCHA_SECRET = os.getenv('HCAPTCHA_SECRET')
assert HCAPTCHA_SECRET

app = FastAPI()
app.mount('/static', StaticFiles(directory='static'), name='static')

db = Database('sqlite:///db.sqlite3')

templates = Jinja2Templates(directory='templates')

@app.on_event('startup')
async def startup():
    await db.connect()

@app.on_event('shutdown')
async def shutdown():
    await db.disconnect()

@app.get('/', response_class=HTMLResponse)
async def root(req: Request):
    uploads = await db.fetch_val(
        'select count(*) from video_uploads')
    videos = await db.fetch_val(
        'select count(distinct site_video_id) from video_uploads')
    return templates.TemplateResponse('index.html', dict(
        request=req,
        uploads=uploads,
        videos=videos,
    ))

@app.post('/api/v1/requestKey')
async def request_key(
    captcha_resp: str = Form(..., alias='h-captcha-response'),
):
    async with httpx.AsyncClient() as client:
        r = await client.post('https://hcaptcha.com/siteverify', data=dict(
            secret=HCAPTCHA_SECRET,
            response=captcha_resp,
        ))
    if not r.json()['success']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    key = str(uuid.uuid4())
    await db.execute('insert into upload_keys(key) values(:key)', 
        values=dict(key=key))
    return key

async def key_exists(key: str):
    count = await db.fetch_val(
        'select count(*) from upload_keys where key = :key',
        values=dict(key=key))
    return count > 0

@app.get('/api/v1/verifyKey/{key}')
async def verify_key(key: str):
    return dict(exists=key_exists(key))

class VideoData(BaseModel):
    videoId: str
    title: Optional[str]
    channelId: Optional[str]
    channelTitle: Optional[str]
    uploadDate: Optional[datetime.datetime]
    viewCount: Optional[int]
    desc: Optional[str]

class UploadData(BaseModel):
    uploadKey: str
    site: str
    videos: List[VideoData]

@app.post('/api/v1/upload')
async def upload(data: UploadData):
    print('got upload:', data)
    if not (await key_exists(data.uploadKey)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    # only yt for now
    assert data.site == 'yt'
    values = []
    for video in data.videos:
        values.append(dict(
            uploader=data.uploadKey,
            uploaded_at=int(time.time()),
            site=data.site,
            site_video_id=video.videoId,
            site_channel_id=video.channelId,
            title=video.title,
            channel_title=video.channelTitle,
            view_count=video.viewCount,
            description=video.desc,
        ))
    await db.execute_many(
        'insert into video_uploads(uploader, uploaded_at, site, site_video_id, site_channel_id, title, channel_title, view_count, description) '
        +'values (:uploader, :uploaded_at, :site, :site_video_id, :site_channel_id, :title, :channel_title, :view_count, :description)',
        values=values)
    return {}