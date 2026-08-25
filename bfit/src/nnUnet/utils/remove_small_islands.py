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


def remove_small_foreground_islands(
    nifti_path,
    output_path=None,
    min_component_voxels=1000,
    min_relative_to_largest=0.01,
    min_slice_component_pixels=250,
    min_slice_relative_to_largest=0.08,
    terminal_slice_count=3,
    min_terminal_label_pixels=350,
    min_terminal_label_relative_to_foreground=0.01,
):
    """
    Remove small disconnected foreground islands from a multi-label mask.

    This is intentionally done on the combined foreground mask instead of
    per-label components. Per-label cleanup can delete one side of bilateral
    structures; foreground cleanup keeps both thighs while removing disconnected
    side anatomy such as hands.
    """
    img = nib.load(nifti_path)
    data = img.get_fdata().astype(np.uint16)
    slice_cleaned = data.copy()
    removed_terminal_voxels = 0

    for slice_index in range(data.shape[-1]):
        slice_data = slice_cleaned[..., slice_index]
        slice_foreground = slice_data > 0
        slice_labeled, slice_components = label(
            slice_foreground,
            structure=np.ones((3, 3), dtype=np.uint8),
        )
        if slice_components <= 1:
            continue

        slice_sizes = np.bincount(slice_labeled.ravel())
        largest_slice_component = int(slice_sizes[1:].max()) if slice_sizes.size > 1 else 0
        min_slice_keep_size = max(
            int(min_slice_component_pixels),
            int(largest_slice_component * min_slice_relative_to_largest),
        )
        keep_slice_ids = np.where(slice_sizes >= min_slice_keep_size)[0]
        keep_slice_ids = keep_slice_ids[keep_slice_ids != 0]
        remove_slice_mask = slice_foreground & ~np.isin(slice_labeled, keep_slice_ids)
        slice_data[remove_slice_mask] = 0
        slice_cleaned[..., slice_index] = slice_data

    if terminal_slice_count > 0:
        z_count = slice_cleaned.shape[-1]
        terminal_indices = sorted(
            set(range(min(terminal_slice_count, z_count)))
            | set(range(max(0, z_count - terminal_slice_count), z_count))
        )

        for slice_index in terminal_indices:
            slice_data = slice_cleaned[..., slice_index]
            foreground_pixels = int(np.count_nonzero(slice_data))
            if foreground_pixels == 0:
                continue

            min_label_keep_size = max(
                int(min_terminal_label_pixels),
                int(foreground_pixels * min_terminal_label_relative_to_foreground),
            )

            for label_id in np.unique(slice_data):
                if label_id == 0:
                    continue

                label_mask = slice_data == label_id
                label_components, num_label_components = label(
                    label_mask,
                    structure=np.ones((3, 3), dtype=np.uint8),
                )
                if num_label_components == 0:
                    continue

                component_sizes = np.bincount(label_components.ravel())
                for component_id in range(1, len(component_sizes)):
                    if component_sizes[component_id] >= min_label_keep_size:
                        continue
                    remove_mask = label_components == component_id
                    removed_terminal_voxels += int(np.count_nonzero(remove_mask))
                    slice_data[remove_mask] = 0

            slice_cleaned[..., slice_index] = slice_data

    foreground = slice_cleaned > 0

    labeled, num_features = label(foreground, structure=np.ones((3, 3, 3), dtype=np.uint8))
    if num_features <= 1:
        if not np.array_equal(slice_cleaned, data):
            header = img.header.copy()
            header.set_data_dtype(data.dtype)
            save_path = output_path or nifti_path
            nib.save(nib.Nifti1Image(slice_cleaned, affine=img.affine, header=header), save_path)
            return save_path
        return nifti_path

    component_sizes = np.bincount(labeled.ravel())
    foreground_sizes = component_sizes[1:]
    if foreground_sizes.size == 0:
        return nifti_path

    largest = int(foreground_sizes.max())
    min_keep_size = max(
        int(min_component_voxels),
        int(largest * min_relative_to_largest),
    )

    keep_component_ids = np.where(component_sizes >= min_keep_size)[0]
    keep_component_ids = keep_component_ids[keep_component_ids != 0]
    keep_mask = np.isin(labeled, keep_component_ids)

    cleaned = np.where(keep_mask, slice_cleaned, 0).astype(data.dtype)
    removed_voxels = int(np.count_nonzero(data) - np.count_nonzero(cleaned))

    header = img.header.copy()
    header.set_data_dtype(data.dtype)
    cleaned_img = nib.Nifti1Image(cleaned, affine=img.affine, header=header)
    save_path = output_path or nifti_path
    nib.save(cleaned_img, save_path)

    print(
        "[INFO] Removed small foreground mask islands "
        f"components={num_features} kept={len(keep_component_ids)} "
        f"min_keep_size={min_keep_size} removed_voxels={removed_voxels} "
        f"removed_terminal_voxels={removed_terminal_voxels}"
    )
    return save_path
