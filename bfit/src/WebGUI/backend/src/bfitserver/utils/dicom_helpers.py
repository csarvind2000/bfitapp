"""
Utility functions for reading and parsing DICOM attributes
"""

from pydicom import dcmread
import warnings


def is_dicom_image_series(dicoms):
    """Checks if the DICOM series is an image series

    Args:
        dicoms (List[str]): List of DICOM filepaths belonging to a DICOM series
    """
    with dcmread(dicoms[0]) as ds:
        return (
            ds.Modality == "CT"
            or ds.Modality == "MR"
            or ds.SOPClassUID.name
            in [
                "CT Image Storage",
                "MR Image Storage",
                "Enhanced CT Image Storage",
            ]
        )


def parse_protocol_data(protocol_data):
    """Returns a dictionary containing the name/value pairs inside the
    "ASCCONV" section of the MrProtocol or MrPhoenixProtocol elements
    of a Siemens CSA Header tag.
    """
    # Protocol_data is a large string (e.g. 32k) that lists a lot of
    # variables in a JSONish format. Following that there's another chunk of
    # data delimited by the strings you see below.
    # That chunk is a list of name=value pairs, INI file style. We
    # ignore everything outside of the ASCCONV delimiters. Everything inside
    # we parse and return as a dictionary.
    try:
        start = protocol_data.find("### ASCCONV BEGIN ###")
        end = protocol_data.find("### ASCCONV END ###")

        assert start != -1
        assert end != -1

        start += len("### ASCCONV BEGIN ###")
        protocol_data = protocol_data[start:end]

        lines = protocol_data.split("\n")

        # The two lines of code below turn the 'lines' list into a list of
        # (name, value) tuples in which name & value have been stripped and
        # all blank lines have been discarded.
        f = lambda pair: (pair[0].strip(), pair[1].strip())
        lines = [f(line.split("=")) for line in lines if "=" in line]

        return dict(lines)

    except AssertionError:
        warnings.warn(
            "Parsing protocol tags failed, unable to find ASCCONV delimiters!"
        )
        return {}


def _metadata_value_text(value):
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return " ".join(_metadata_value_text(item) for item in value)
    return str(value)


THIGH_DIXON_320_PROTOCOL = "t1+AF8-vibe+AF8-tra+AF8-p2+AF8-bh+AF8-320+AF8-DIXON Thigh"


def _safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def infer_dixon_channel(metadata):
    """Infer Dixon channel from DICOM metadata saved on an instance."""
    if not metadata:
        return None

    protocol_name = _metadata_value_text(metadata.get("Protocol Name"))
    scan_options = _metadata_value_text(metadata.get("Scan Options")).upper()
    pixel_bw = _safe_float(
        metadata.get("Pixel Bandwidth", metadata.get("PixelBandwidth"))
    )

    if protocol_name == THIGH_DIXON_320_PROTOCOL:
        if scan_options == "SAT2" and pixel_bw in (None, 504.0):
            return "inphase"
        if scan_options == "DIXW":
            return "water"
        if scan_options == "DIXF":
            return "fat"

    fields = [
        metadata.get("Series Description"),
        protocol_name,
        scan_options,
        metadata.get("Image Type"),
        metadata.get("Sequence Name"),
        metadata.get("Image Comments"),
    ]
    text = " ".join(_metadata_value_text(field) for field in fields).lower()
    compact = text.replace(" ", "").replace("_", "").replace("-", "")

    if (
        "fatfraction" in compact
        or "fatfrac" in compact
        or "\\ff" in text
        or " ff " in f" {text} "
    ):
        return "fatfraction"
    if (
        "inphase" in compact
        or "inph" in compact
        or "dixin" in compact
        or "\\in" in text
    ):
        return "inphase"
    if "water" in compact or "dixw" in compact or "\\w" in text:
        return "water"
    if (
        "fat" in compact
        or "dixf" in compact
        or "\\f" in text
    ):
        return "fat"

    return None


def is_display_dixon_channel(channel):
    """Only inphase should be shown to users; unknown channels stay visible."""
    return channel in (None, "", "inphase")
