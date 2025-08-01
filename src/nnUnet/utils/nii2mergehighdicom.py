import os
import glob
import numpy as np
import nibabel as nib
from pydicom import dcmread
from pydicom.uid import generate_uid, ExplicitVRLittleEndian
import highdicom as hd
from highdicom.seg import Segmentation
from highdicom.sr.coding import CodedConcept
from highdicom import AlgorithmIdentificationSequence
import highdicom.version

def load_dicom_series_sorted_by_z(dicom_dir):
    print("Entered 1")
    """Load DICOM series and sort by z-axis (ImagePositionPatient)."""
    all_files = glob.glob(os.path.join(dicom_dir, "**/*"), recursive=True)
    datasets = []
    for f in all_files:
        print("dicom input", f)
        try:
            ds = dcmread(f, stop_before_pixels=False)
            if hasattr(ds, "PixelData"):
                datasets.append(ds)
        except:
            pass

    if not datasets:
        raise FileNotFoundError(f"No valid DICOM slices found in {dicom_dir}")
    datasets.sort(key=lambda ds: float(ds.ImagePositionPatient[2]))
    return datasets

def convert_nifti_to_dicom_seg(nifti_path, dicom_reference_dir, output_dicom_path):
    """
    Convert NIfTI segmentation mask to DICOM SEG using reference DICOM series.
    """
    print("dicom_reference_dir",dicom_reference_dir)
    # Load reference DICOM series
    ref_slices = load_dicom_series_sorted_by_z(dicom_reference_dir)
    num_slices = len(ref_slices)
    rows, cols = ref_slices[0].Rows, ref_slices[0].Columns

    # Load NIfTI mask
    nii_img = nib.load(nifti_path)
    seg_data = (nii_img.get_fdata(dtype=np.float32) > 0).astype(np.uint8)

    seg_data = np.rot90(seg_data, k=1, axes=(0, 1))  # rotate in-plane

    # Handle most common shapes safely
    if seg_data.shape == (rows, cols, num_slices):
        seg_data = np.transpose(seg_data, (2, 0, 1))
    elif seg_data.shape == (rows, cols, 1):
        seg_data = np.repeat(seg_data, num_slices, axis=-1)
        seg_data = np.transpose(seg_data, (2, 0, 1))
    elif seg_data.shape == (num_slices, rows, cols):
        pass  # already fine
    else:
        raise ValueError(f"Shape mismatch: {seg_data.shape} vs ({num_slices}, {rows}, {cols})")

    # Create coded concepts (can customize)
    segment_label = "Segmentation"
    segment_category = CodedConcept(value="T-D0050", scheme_designator="SRT", meaning="Tissue")
    segment_type = CodedConcept(value="T-D400A", scheme_designator="SRT", meaning="Organ")

    my_algorithm = AlgorithmIdentificationSequence(
        name="MySegAlgorithm",
        version="1.0",
        family=CodedConcept(value="123456", scheme_designator="99_MYSOFTWARE", meaning="Seg Algorithm")
    )

    segment_descriptions = [
        hd.seg.SegmentDescription(
            segment_number=1,
            segment_label=segment_label,
            segmented_property_category=segment_category,
            segmented_property_type=segment_type,
            algorithm_type=hd.seg.SegmentAlgorithmTypeValues.AUTOMATIC,
            algorithm_identification=my_algorithm,
            tracking_uid=generate_uid(),
            tracking_id="Segmentation"
        )
    ]

    seg = Segmentation(
        source_images=ref_slices,
        pixel_array=seg_data,
        segmentation_type=hd.seg.SegmentationTypeValues.BINARY,
        segment_descriptions=segment_descriptions,
        series_instance_uid=generate_uid(),
        series_number=1,
        sop_instance_uid=generate_uid(),
        instance_number=1,
        manufacturer="HighDicomPipeline",
        manufacturer_model_name='SimpleNifti2DicomSEG',
        software_versions=highdicom.version.__version__,
        device_serial_number='001',
        transfer_syntax_uid=ExplicitVRLittleEndian,
    )

    seg.save_as(output_dicom_path)
    print(f"✅ DICOM SEG saved at: {output_dicom_path}")
    return output_dicom_path
