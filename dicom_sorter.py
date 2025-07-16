import os
import json
import shutil
import subprocess
import pydicom
from pydicom.multival import MultiValue
from collections import defaultdict


class DicomToNiftiSorter:
    def __init__(self, input_root, config_path, user="admin"):
        self.input_root = input_root
        self.temp_dicom = "tempdicom"
        self.output_root = os.path.join("media", user, "studies")
        self.config_path = config_path
        self.config = self.load_config()

        os.makedirs(self.temp_dicom, exist_ok=True)
        os.makedirs(self.output_root, exist_ok=True)

    def clean(self, s):
        if isinstance(s, MultiValue):
            s = " ".join(str(item) for item in s)
        return str(s).strip().lower().replace("+af8-", "_")

    def load_config(self):
        with open(self.config_path, "r") as f:
            return json.load(f)

    def extract_dicom_metadata(self, dicom_path):
        try:
            ds = pydicom.dcmread(dicom_path, stop_before_pixels=True, force=True)
            study_uid = ds.StudyInstanceUID
            series_uid = ds.SeriesInstanceUID
            protocol_name = self.clean(ds.get("ProtocolName", "NA"))
            scan_options = self.clean(ds.get("ScanOptions", "NA"))
            bandwidth = float(ds.get("PixelBandwidth", -1))
            return study_uid, series_uid, protocol_name, scan_options, bandwidth
        except Exception as e:
            print(f"❌ Failed to read DICOM {dicom_path}: {e}")
            return None, None, "NA", "NA", -1

    def match_json_to_rule(self, json_path):
        try:
            with open(json_path, "r") as f:
                j = json.load(f)
                protocol = self.clean(j.get("ProtocolName", ""))
                scanopt = self.clean(j.get("ScanOptions", ""))
                bw = float(j.get("PixelBandwidth", -1))

                for rule in self.config["rules"]:
                    if (
                        self.clean(rule["ProtocolName"]) in protocol
                        and self.clean(rule["ScanOptions"]) in scanopt
                        and abs(bw - float(rule["PixelBandwidth"])) < 1e-2
                    ):
                        return rule["Tag"]
        except Exception as e:
            print(f"❌ Failed to read JSON {json_path}: {e}")
        return None

    def collect_series(self):
        series_dict = defaultdict(list)
        for root, _, files in os.walk(self.input_root):
            for f in files:
                if not f.lower().endswith((".dcm", ".ima", ".sr")):
                    continue
                dcm_path = os.path.join(root, f)
                study_uid, series_uid, _, _, _ = self.extract_dicom_metadata(dcm_path)
                if study_uid and series_uid:
                    series_dict[(study_uid, series_uid)].append(dcm_path)
        return series_dict

    def convert_and_sort(self, series_dict):
        matched_info = []
        for (study_uid, series_uid), files in series_dict.items():
            temp_series_dir = os.path.join(self.temp_dicom, series_uid)
            os.makedirs(temp_series_dir, exist_ok=True)

            for f in files:
                shutil.copy2(f, temp_series_dir)

            temp_output_dir = os.path.join(temp_series_dir, "nifti")
            os.makedirs(temp_output_dir, exist_ok=True)

            print(f"🔄 Converting SeriesUID {series_uid} in StudyUID {study_uid}")
            result = subprocess.run(
                ["dcm2niix", "-z", "y", "-f", "%p_%s", "-o", temp_output_dir, temp_series_dir],
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                print(f"❌ dcm2niix failed for SeriesUID {series_uid}: {result.stderr}")
                shutil.rmtree(temp_series_dir, ignore_errors=True)
                continue

            matched = False
            tag = None
            for fname in os.listdir(temp_output_dir):
                if not fname.endswith(".json"):
                    continue
                json_path = os.path.join(temp_output_dir, fname)
                tag = self.match_json_to_rule(json_path)
                if tag:
                    base_name = fname.replace(".json", "")
                    nii_file = os.path.join(temp_output_dir, base_name + ".nii.gz")
                    if os.path.exists(nii_file):
                        series_output_dir = os.path.join(self.output_root, study_uid, "series", series_uid)
                        instance_dir = os.path.join(series_output_dir, "instance")
                        os.makedirs(instance_dir, exist_ok=True)

                        shutil.move(json_path, os.path.join(series_output_dir, base_name + ".json"))
                        shutil.move(nii_file, os.path.join(series_output_dir, base_name + ".nii.gz"))

                        for src_dicom in files:
                            shutil.copy2(src_dicom, instance_dir)

                        matched = True

                        try:
                            ds = pydicom.dcmread(files[0], stop_before_pixels=True)
                            instance_uid = ds.SOPInstanceUID
                            modality = tag  # Use matched tag (abd/thigh)
                        except Exception as e:
                            print(f"❌ Failed to read DICOM metadata: {e}")
                            continue

                        matched_info.append({
                            "study_id": study_uid,
                            "series_id": series_uid,
                            "instance_id": instance_uid,
                            "modality": modality,
                            "file_path": os.path.join(instance_dir, os.path.basename(files[0])),
                            "is_matched": True
                        })

            if not matched:
                print(f"⏭️  No match for SeriesUID {series_uid}, cleaning up...")

            shutil.rmtree(temp_series_dir, ignore_errors=True)

        return matched_info

    def run(self):
        series = self.collect_series()
        print(f"📦 Collected {len(series)} series to process.")
        dicom_info_list = self.convert_and_sort(series)

        print("\n🎉 All done!")
        print(f"🧹 Cleaning up uploaded DICOMs at: {self.input_root}")
        shutil.rmtree(self.input_root, ignore_errors=True)
        os.makedirs(self.input_root, exist_ok=True)
        print("✅ Temporary DICOMs cleaned up.")
        return dicom_info_list
