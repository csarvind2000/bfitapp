"""
Very small placeholder tasks so that Django can import them.
If you copy real RQ tasks into your project, simply remove this file.
"""
import logging, time
from typing import List

logger = logging.getLogger("bfitserver")

def _fake_worker(name: str, dicoms: List[str]):
    logger.info("[%-5s] stub started  n=%d", name, len(dicoms))
    time.sleep(2)                       # simulate work
    logger.info("[%-5s] stub finished", name)
    return {"status": "ok", "n_dicoms": len(dicoms)}

# -------------------------------------------------------------------
# public API expected by views.py
# -------------------------------------------------------------------
def segmentation_abdomen(dicoms: List[str]): return _fake_worker("ABD",   dicoms)
def segmentation_thigh  (dicoms: List[str]): return _fake_worker("THIGH", dicoms)
def segmentation_mmap   (dicoms: List[str]): return _fake_worker("MMAP",  dicoms)
