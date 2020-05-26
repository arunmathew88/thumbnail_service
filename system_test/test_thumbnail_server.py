import pytest
import requests
import uuid
import time
import os
from queue import Queue
from shutil import copyfile
from diffimg import diff
from threading import Thread

web_server_host = "web"
web_server_port = 8080


def test_get_form():
    response = requests.get(f'http://{web_server_host}:{web_server_port}/')
    assert response.status_code == 200
    assert "text/html" in response.headers['Content-Type']
    assert "<form" in response.text


def test_get_missing_thumbnail():
    response = requests.get(f'http://{web_server_host}:{web_server_port}/thumbnails/missingimage.png')
    assert response.status_code == 404
    assert "application/json" in response.headers['Content-Type']
    assert "Thumbnail does not exist" in response.text


def test_post_upload_image():
    file = {'upload': open('test_images/test_image.png', 'rb')}
    response = requests.post(f'http://{web_server_host}:{web_server_port}/upload', files=file)
    assert response.status_code == 200
    assert "application/json" in response.headers['Content-Type']
    assert "Image thumbnailing queued" in response.text


def validate_image(file_name):
    file_name = os.path.basename(file_name)
    response = requests.get(f'http://{web_server_host}:{web_server_port}/thumbnails/{file_name}')
    while response.status_code == 404:
        time.sleep(1)
        response = requests.get(f'http://{web_server_host}:{web_server_port}/thumbnails/{file_name}')
    assert response.status_code == 200
    assert "image/png" in response.headers['Content-Type']
    file = open("test_images/thumbnail.png", "wb")
    file.write(response.content)
    file.close()
    assert diff('test_images/thumbnail.png', 'test_images/test_thumbnail.png') == 0.0


@pytest.mark.timeout(60)
def test_generated_thumbnail():
    file_prefix = str(uuid.uuid1())[:6]
    new_file_name = 'test_images/' + file_prefix + '_test_image.png'
    copyfile('test_images/test_image.png', new_file_name)
    file = {'upload': open(new_file_name, 'rb')}
    response = requests.post(f'http://{web_server_host}:{web_server_port}/upload', files=file)
    assert response.status_code == 200
    assert "application/json" in response.headers['Content-Type']
    assert "Image thumbnailing queued" in response.text
    validate_image(new_file_name)


concurrent = 10
que = Queue(concurrent)


def send_request():
    while True:
        file_name = que.get()
        file = {'upload': open(file_name, 'rb')}
        response = requests.post(f'http://{web_server_host}:{web_server_port}/upload', files=file)
        assert response.status_code == 200
        que.task_done()


@pytest.mark.timeout(300)
def test_generated_thumbnail_10():
    validation_que = Queue(concurrent)
    for i in range(concurrent):
        file_prefix = str(uuid.uuid1())[:6]
        new_file_name = 'test_images/' + file_prefix + '_test_image.png'
        copyfile('test_images/test_image.png', new_file_name)
        que.put(new_file_name)
        validation_que.put(new_file_name)

    for i in range(concurrent):
        t = Thread(target=send_request)
        t.daemon = True
        t.start()

    que.join()

    while validation_que.empty() is False:
        validate_image(validation_que.get())
        validation_que.task_done()
