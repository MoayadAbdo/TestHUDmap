"""Downloads with a timeout. Files are written to `<name>.part` and renamed when complete,
so a broken download never looks like a finished file."""
import json
import os
import shutil
import urllib.request

TIMEOUT_S = 60


def get_json(url, timeout=TIMEOUT_S):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.load(r)


def download(url, path, timeout=TIMEOUT_S):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    part = path + ".part"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r, open(part, "wb") as fh:
            shutil.copyfileobj(r, fh)
        os.replace(part, path)
    finally:
        if os.path.exists(part):
            os.remove(part)
    return path


class DownloadCache:
    """Keeps downloads in one folder and fetches each file only once."""

    def __init__(self, folder, timeout=TIMEOUT_S):
        self.folder = folder
        self.timeout = timeout

    def file(self, url, name):
        path = os.path.join(self.folder, name)
        if not os.path.exists(path):
            download(url, path, self.timeout)
        return path

    def json(self, url, name):
        with open(self.file(url, name)) as fh:
            return json.load(fh)
