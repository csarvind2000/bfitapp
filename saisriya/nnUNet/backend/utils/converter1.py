#!/usr/bin/env python3

import os
import glob
import argparse
import numpy as np
import nibabel as nib
from pydicom import dcmread
from pydicom.uid import generate_uid, ExplicitVRLittleEndian

import highdicom as hd
from highdicom.seg import Segmentation
from highdicom.sr.coding import CodedConcept
from highdicom import AlgorithmIdentificationSequence
import highdicom.version

##############################################################################
# Default Label Maps
##############################################################################
# Abdomen segmentation labels
DEFAULT_ABDOMEN_LABEL_MAP = {
    1: ('Subcutaneous Superficial Fat', 'T-0F182', 'SSAT'),
    2: ('Subcutaneous Deep Fat',       'T-0F181', 'DSAT'),
    3: ('Visceral Fat',               'T-0F180', 'VAT'),
    4: ('Muscle',                     'T-D3000', 'MUSCLE'),
}
# Thigh segmentation labels
DEFAULT_THIGH_LABEL_MAP = {
    1: ('Bone',                           'T-28010', 'BONE'),
    2: ('Intramuscular Adipose Tissue',   'T-D3002', 'IMAT'),
    3: ('Muscle',                         'T-D3000', 'MUSCLE'),
    4: ('Subcutaneous Adipose Tissue',    'T-0F182', 'SAT'),
}

##############################################################################
# Converter Class
##############################################################################
class DicomSegConverter:
    """
    Convert multi-label NIfTI segmentations into DICOM SEG files.

    input_dir: directory of NIfTI files
    dicom_ref: either a directory of DICOM series or a single DICOM file
    output_dir: where to write SEG files
    label_map: mapping of int->(name, code, id)
    transforms: rotate/flip flags
    """
    def __init__(
        self,
        input_dir: str,
        dicom_ref: str,
        output_dir: str,
        label_map: dict,
        rotate_90: bool = False,
        rotate_180: bool = False,
        flip_lr: bool = False,
        flip_ud: bool = False
    ):
        if label_map is None:
            raise ValueError("Label map must be provided and cannot be None")
        self.input_dir = input_dir
        self.dicom_ref = dicom_ref
        self.output_dir = output_dir
        self.label_map = label_map
        self.rotate_90 = rotate_90
        self.rotate_180 = rotate_180
        self.flip_lr = flip_lr
        self.flip_ud = flip_ud
        self.ref_slices = self._load_reference_slices()


    def _load_reference_slices(self):
        """
        Load DICOM slices. If dicom_ref is a file, load single slice; if dir, load all and sort by Z.
        """
        if os.path.isfile(self.dicom_ref):
            # Single DICOM file
            ds = dcmread(self.dicom_ref, stop_before_pixels=False)
            if not hasattr(ds, 'PixelData'):
                raise FileNotFoundError(f"File {self.dicom_ref} has no pixel data")
            return [ds]
        # Otherwise treat as directory
        files = glob.glob(os.path.join(self.dicom_ref, '**', '*'), recursive=True)
        ds_list = []
        for f in files:
            if os.path.isfile(f):
                try:
                    ds = dcmread(f, stop_before_pixels=False)
                    if hasattr(ds, 'PixelData'):
                        ds_list.append(ds)
                except Exception:
                    continue
        if not ds_list:
            raise FileNotFoundError(f"No DICOM slices found in {self.dicom_ref}")
        # Sort by Z position
        ds_list.sort(key=lambda x: float(getattr(x, 'ImagePositionPatient', [0,0,0])[2]))
        return ds_list

    def convert_nifti(self, nifti_path: str, output_path: str):
        """Convert a single NIfTI to DICOM SEG."""
        seg_data = nib.load(nifti_path).get_fdata(dtype=np.float32)
        num_slices = len(self.ref_slices)
        rows, cols = self.ref_slices[0].Rows, self.ref_slices[0].Columns
        # Orient slices
        if seg_data.shape == (rows, cols, num_slices):
            seg_data = np.transpose(seg_data, (2, 0, 1))
        elif seg_data.shape != (num_slices, rows, cols):
            raise ValueError(f"NIfTI {seg_data.shape} != reference {num_slices, rows, cols}")
        # Transforms
        if self.rotate_90:
            seg_data = np.rot90(seg_data, k=1, axes=(1, 2))
        if self.rotate_180:
            seg_data = np.rot90(seg_data, k=2, axes=(1, 2))
        if self.flip_lr:
            seg_data = np.flip(seg_data, axis=2)
        if self.flip_ud:
            seg_data = np.flip(seg_data, axis=1)
        # Build segments
        algorithm = AlgorithmIdentificationSequence(
            name="MultiLabelSegAlgo",
            version="1.0",
            family=CodedConcept("123456","99_MYSOFTWARE","Segmentation Algorithm")
        )
        descriptions, masks = [], []
        labels = np.unique(seg_data).astype(np.uint8)
        labels = labels[labels!=0]
        for idx, lv in enumerate(labels, start=1):
            mask = (seg_data==float(lv)).astype(np.float32)
            if mask.shape != (num_slices, rows, cols):
                raise ValueError(f"Mask {mask.shape} invalid for {lv}")
            masks.append(mask)
            name, code, tid = self.label_map.get(lv, (f"Label{lv}","T-00000",f"Label_{lv}"))
            descriptions.append(
                hd.seg.SegmentDescription(
                    segment_number=idx,
                    segment_label=name,
                    segmented_property_category=CodedConcept("T-D0050","SRT","Tissue"),
                    segmented_property_type=CodedConcept(code,"SRT",name),
                    algorithm_type=hd.seg.SegmentAlgorithmTypeValues.AUTOMATIC,
                    algorithm_identification=algorithm,
                    tracking_uid=generate_uid(),
                    tracking_id=tid
                )
            )
        pixel_array = np.stack(masks, axis=-1)
        print(f"[DEBUG] pixel_array shape: {pixel_array.shape}")
        seg = Segmentation(
            source_images=self.ref_slices,
            pixel_array=pixel_array,
            segmentation_type=hd.seg.SegmentationTypeValues.BINARY,
            segment_descriptions=descriptions,
            series_instance_uid=generate_uid(),
            series_number=1,
            sop_instance_uid=generate_uid(),
            instance_number=1,
            manufacturer="AutoGen",
            manufacturer_model_name="seg2dicom",
            software_versions=highdicom.version.__version__,
            device_serial_number="AUTO",
            transfer_syntax_uid=ExplicitVRLittleEndian
        )
        seg.save_as(output_path)
        ds = dcmread(output_path)
        return ds.SeriesInstanceUID, ds.SOPInstanceUID

    def batch_convert(self):
        os.makedirs(self.output_dir, exist_ok=True)
        results=[]
        for nifti in sorted(glob.glob(os.path.join(self.input_dir,'*.nii*'))):
            out_name=f"SEG_{os.path.basename(nifti).rsplit('.',1)[0]}.dcm"
            out_path=os.path.join(self.output_dir,out_name)
            print(f"[INFO] Converting {nifti} -> {out_path}")
            try:
                suid,iuid=self.convert_nifti(nifti,out_path)
                print(f"[INFO] Saved SEG: Series={suid}, SOP={iuid}")
                results.append((nifti,suid,iuid))
            except Exception as e:
                print(f"[ERROR] {nifti} failed: {e}")
        return results

##############################################################################
# Example usage in app.py
##############################################################################
# from converter import DicomSegConverter, DEFAULT_ABDOMEN_LABEL_MAP, DEFAULT_THIGH_LABEL_MAP
#
# # For a DICOM series folder:
# abd_series_conv = DicomSegConverter(
#     input_dir="/path/to/abdomen_CT/nii",
#     dicom_ref="/path/to/abdomen_CT/series_folder",
#     output_dir="/path/to/abdomen_CT/out",
#     label_map=DEFAULT_ABDOMEN_LABEL_MAP,
#     rotate_180=True
# )
# abd_series_conv.batch_convert()
#
# # For a single DICOM file:
# thigh_file_conv = DicomSegConverter(
#     input_dir="/path/to/thigh_MR/nii",
#     dicom_ref="/path/to/thigh_MR/image.dcm",
#     output_dir="/path/to/thigh_MR/out",
#     label_map=DEFAULT_THIGH_LABEL_MAP
# )
# thigh_file_conv.batch_convert()
