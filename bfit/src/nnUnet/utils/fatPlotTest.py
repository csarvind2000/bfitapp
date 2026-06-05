import os
import numpy as np
import nibabel as nib
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import logging


def truncate(number, digits) -> float:
    stepper = 10.0 ** digits
    return int(stepper * number) / stepper


def SplitTo2D(volume3D):
    return [volume3D[:, :, i] for i in range(volume3D.shape[2])]


def class_voxel(slice2D):
    unique, counts = np.unique(slice2D, return_counts=True)
    return dict(zip(unique.astype(int), counts))


def tissueVolumeGraph(tissue_labels, volume_slices, class_colors, output_dir):
    logging.info("Plotting individual tissue volume graphs")
    volume_slices = [list(reversed(v)) for v in volume_slices]
    os.makedirs(output_dir, exist_ok=True)

    for i in range(len(tissue_labels)):
        volumes = volume_slices[i]
        if all(v == 0 for v in volumes):
            logging.warning(f"Skipping {tissue_labels[i]} — all volumes are 0")
            continue

        fig, ax = plt.subplots(figsize=(4, 5))
        fig.patch.set_facecolor('black')
        ax.set_facecolor('black')

        y_vals = list(range(1, len(volumes) + 1))
        ax.barh(y_vals, volumes, color=class_colors[i])
        ax.invert_yaxis()

        ax.set_title(f"{tissue_labels[i]} in CC", color='white', fontweight="bold", fontsize=14)
        ax.tick_params(axis='x', colors='white')
        ax.tick_params(axis='y', colors='white')
        ax.xaxis.set_major_locator(ticker.MaxNLocator(integer=True))
        ax.yaxis.set_major_locator(ticker.MaxNLocator(integer=True))

        for spine in ax.spines.values():
            spine.set_edgecolor('white')
            spine.set_linewidth(1.5)

        save_path = os.path.join(output_dir, f"{tissue_labels[i]}.png")
        plt.tight_layout()
        plt.savefig(save_path, dpi=300, bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close()
        logging.info(f"Saved individual plot to {save_path}")


def genericVolumeAnalysis(seg_path, region, output_dir):
    logging.info("genericVolumeAnalysis:: Start")

    seg_path = os.path.abspath(seg_path)
    seg_name = os.path.basename(seg_path).replace(".nii.gz", "").replace(".nii", "")

    # Load NIfTI
    img = nib.load(seg_path)
    data = img.get_fdata()
    print(f"[DEBUG] Loaded NIfTI: shape={data.shape}, dtype={data.dtype}")

    # ---------------- LABEL MAPPING ----------------
    if region.lower() == "abdomen":
        label_mapping = {1: "SSAT", 2: "DSAT", 3: "VAT"}
        class_colors = ["#e41a1c", "#4daf4a", "#377eb8"]

    elif region.lower() == "thigh":
        unique_labels = np.unique(data).astype(int)
        unique_labels = unique_labels[unique_labels != 0]

        # 5-class
        if set(unique_labels).issubset({1, 2, 3, 4, 5}):
            label_mapping = {
                1: "Bone",
                2: "IMAT",
                3: "SSAT",
                4: "Muscle",
                5: "Organ"
            }

        # 48-class
        else:
            label_mapping = {
                1: "bone",
                2: "IMAT",
                3: "SAT",
                4: "gluteus_maximus_left",
                5: "gluteus_maximus_right",
                6: "tensor_fascia_latae_left",
                7: "tensor_fascia_latae_right",
                8: "iliacus_left",
                9: "iliacus_right",
                10: "ilium_left",
                11: "ilium_right",
                12: "femur_left",
                13: "femur_right",
                14: "pectineus_left",
                15: "pectineus_right",
                16: "obturator_internus_left",
                17: "obturator_internus_right",
                18: "obturator_externus_left",
                19: "obturator_externus_right",
                20: "gemelli_quadratus_femoris_left",
                21: "gemelli_quadratus_femoris_right",
                22: "vastus_lateralis_left",
                23: "vastus_lateralis_right",
                24: "vastus_intermedius_left",
                25: "vastus_intermedius_right",
                26: "vastus_medialis_left",
                27: "vastus_medialis_right",
                28: "rectus_femoris_left",
                29: "rectus_femoris_right",
                30: "sartorius_left",
                31: "sartorius_right",
                32: "gracilis_left",
                33: "gracilis_right",
                34: "semimembranosus_left",
                35: "semimembranosus_right",
                36: "semitendinosus_left",
                37: "semitendinosus_right",
                38: "biceps_femoris_long_head_left",
                39: "biceps_femoris_long_head_right",
                40: "biceps_femoris_short_head_left",
                41: "biceps_femoris_short_head_right",
                42: "adductor_magnus_left",
                43: "adductor_magnus_right",
                44: "adductor_longus_left",
                45: "adductor_longus_right",
                46: "adductor_brevis_left",
                48: "groin_region",
                49: "IMF"
            }

        label_mapping = {k: v for k, v in label_mapping.items() if k in unique_labels}
        class_colors = ["#ff7f00"] * len(label_mapping)

    else:
        raise ValueError(f"Unknown region: {region}")

    tissue_labels = list(label_mapping.values())

    # ---------------- VOXEL SIZE ----------------
    pixdim = img.header['pixdim'][1:4]
    if not np.all(pixdim > 0):
        pixdim = [1.0, 1.0, 1.0]

    vol_per_voxel = pixdim[0] * pixdim[1] * pixdim[2] * 1e-3  # cc
    pixel_area = pixdim[0] * pixdim[1]  # mm²

    slices_2D = SplitTo2D(data)

    # ---------------- PER SLICE CALCULATION ----------------
    per_slice_volumes = {t: [] for t in tissue_labels}
    rows = []

    for i, slice_2D in enumerate(slices_2D):
        cls = class_voxel(slice_2D)

        for lbl, tissue in label_mapping.items():
            voxel_count = cls.get(lbl, 0)

            area = voxel_count * pixel_area
            volume = voxel_count * vol_per_voxel

            per_slice_volumes[tissue].append(volume)

            # ✅ Long-format row
            rows.append({
                "Slice": i + 1,
                "Label": tissue,
                "Area_mm2": truncate(area, 2),
                "Volume_cc": truncate(volume, 3)
            })

    # ---------------- TOTAL CALCULATION ----------------
    cls_total = class_voxel(data)
    tissue_totals = {t: cls_total.get(lbl, 0) * vol_per_voxel for lbl, t in label_mapping.items()}
    fat_total = sum(tissue_totals.values())
    tissue_percents = {t: (v / fat_total) * 100 if fat_total > 0 else 0 for t, v in tissue_totals.items()}

    os.makedirs(output_dir, exist_ok=True)

    # ---------------- SAVE GRAPHS ----------------
    tissueVolumeGraph(
        tissue_labels=tissue_labels,
        volume_slices=[per_slice_volumes[t] for t in tissue_labels],
        class_colors=class_colors,
        output_dir=output_dir
    )

    # ---------------- SAVE TOTAL CSV ----------------
    csv_path = os.path.join(output_dir, "volume_stats.csv")

    df = pd.DataFrame([[
        *[truncate(tissue_totals.get(t, 0), 3) for t in tissue_labels],
        truncate(fat_total, 3),
        *[truncate(tissue_percents.get(t, 0), 2) for t in tissue_labels]
    ]],
        columns=[f"{t}_Volume" for t in tissue_labels] +
                ["Total_Volume"] +
                [f"{t}_%" for t in tissue_labels]
    )

    df.to_csv(csv_path, index=False)

    # ---------------- SAVE PER-SLICE CSV ----------------
    slice_csv_path = os.path.join(output_dir, f"{seg_name}_per_slice.csv")
    df_slices = pd.DataFrame(rows)
    df_slices.to_csv(slice_csv_path, index=False)

    logging.info("genericVolumeAnalysis:: Done")
