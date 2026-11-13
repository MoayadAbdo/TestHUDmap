"""Values from PDS3 (.lbl) and ISIS (.cub) text labels: `KEY = value` lines inside
OBJECT / GROUP blocks. Only what the layers need."""
import re

_BLOCK = re.compile(r"^\s*(END_)?(OBJECT|GROUP)\b", re.M | re.I)


def section(text, name):
    """Text inside the first OBJECT or GROUP called `name`, up to its own END line."""
    start = re.search(rf"^\s*(OBJECT|GROUP)\s*=\s*{re.escape(name)}\s*$", text, re.M | re.I)
    if not start:
        raise KeyError(name)
    kind, depth = start.group(1).upper(), 1
    for m in _BLOCK.finditer(text, start.end()):
        if m.group(2).upper() != kind:
            continue
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return text[start.end():m.start()]
    raise ValueError(f"no end for {name}")


def _value(text, key):
    m = re.search(rf"^\s*{re.escape(key)}\s*=\s*(.+)$", text, re.M | re.I)
    if not m:
        raise KeyError(key)
    return m


def number(text, key):
    """First number of the value (a unit like <KILOMETER> is ignored)."""
    m = re.match(r"\(?\s*([-+0-9.eE]+)", _value(text, key).group(1))
    if not m:
        raise ValueError(f"{key} is not a number")
    return float(m.group(1))


def word(text, key):
    return _value(text, key).group(1).strip().strip('"').upper()


def quoted(text, key):
    """A "quoted" value that may run over several lines, with the line breaks removed."""
    m = re.search(rf'^\s*{re.escape(key)}\s*=\s*"([^"]*)"', text, re.M | re.I)
    if not m:
        raise KeyError(key)
    return " ".join(m.group(1).split())
