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
