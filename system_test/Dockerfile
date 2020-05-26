FROM python:3.8.3-alpine3.11

RUN apk update \
    && apk add --virtual build-deps gcc python3-dev musl-dev \
    && apk add postgresql \
    && apk add postgresql-dev \
    && pip install psycopg2 \
    && apk add jpeg-dev zlib-dev libjpeg \
    && pip install Pillow \
    && apk del build-deps

COPY . /server-qe
WORKDIR /server-qe

RUN pip install -r requirements.txt

CMD ["pytest"]