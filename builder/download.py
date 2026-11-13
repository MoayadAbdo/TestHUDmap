"""Downloads with a timeout. Files are written to `<name>.part` and renamed when complete,
so a broken download never looks like a finished file."""
import json
import os
import shutil
import ssl
import urllib.request

TIMEOUT_S = 60
PARTIAL_CONTENT = 206


def _tls():
    """System CA roots plus certifi's (the system file lacks some newer roots, e.g. Sectigo R46)."""
    ctx = ssl.create_default_context()
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except ImportError:
        pass
    return ctx


TLS = _tls()


def get_json(url, timeout=TIMEOUT_S):
    with urllib.request.urlopen(url, timeout=timeout, context=TLS) as r:
        return json.load(r)


def _copy_range(r, fh, url, length):
    if getattr(r, "status", None) != PARTIAL_CONTENT:
        raise OSError(f"server did not send a byte range: {url}")
    data = r.read(length)
    if len(data) != length:
        raise OSError(f"short byte range ({len(data)} of {length}): {url}")
    fh.write(data)


def download(url, path, timeout=TIMEOUT_S, byte_range=None):
    """byte_range = (start, length) fetches only those bytes of a big file."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    part = path + ".part"
    req = urllib.request.Request(url)
    if byte_range:
        start, length = byte_range
        req.add_header("Range", f"bytes={start}-{start + length - 1}")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=TLS) as r, open(part, "wb") as fh:
            if byte_range:
                _copy_range(r, fh, url, byte_range[1])
            else:
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

    def file(self, url, name, byte_range=None):
        path = os.path.join(self.folder, name)
        if not os.path.exists(path):
            download(url, path, self.timeout, byte_range)
        return path

    def json(self, url, name):
        with open(self.file(url, name)) as fh:
            return json.load(fh)
