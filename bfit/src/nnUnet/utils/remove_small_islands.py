# utils/remove_small_islands.py

import numpy as np
import nibabel as nib
from scipy.ndimage import label, find_objects

def remove_non_main_blob(nifti_path, output_path=None):
    img = nib.load(nifti_path)
    data = img.get_fdata().astype(np.uint8)

    cleaned = np.zeros_like(data)

    for label_id in np.unique(data):
        if label_id == 0:
            continue

        binary = (data == label_id).astype(np.uint8)
        labeled, num_features = label(binary)

        max_volume = 0
        main_component = None

        for i in range(1, num_features + 1):
            component = (labeled == i)
            volume = component.sum()
            if volume > max_volume:
                max_volume = volume
                main_component = component

        if main_component is not None:
            cleaned[main_component] = label_id

    cleaned_img = nib.Nifti1Image(cleaned, affine=img.affine, header=img.header)
    nib.save(cleaned_img, output_path or nifti_path)
