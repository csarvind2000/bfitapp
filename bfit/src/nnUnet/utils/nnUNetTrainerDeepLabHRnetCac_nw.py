# -----------------------------------------------------
# 1.  Imports
# -----------------------------------------------------
import numpy as np
import torch
import torch.nn.functional as F


from nnunetv2.training.loss.robust_ce_loss import TopKLoss
from nnunetv2.training.loss.deep_supervision import DeepSupervisionWrapper
from nnunetv2.training.nnUNetTrainer.nnUNetTrainer import nnUNetTrainer

import segmentation_models_pytorch as smp
# -----------------------------------------------------
# 2.  Trainer sub-class
# -----------------------------------------------------

class nnUNetTrainerDeepLabHRnetCac_nw(nnUNetTrainer):
    """

    """

    def __init__(self, plans: dict, configuration: str, fold: int,
                 dataset_json: dict, device: torch.device = torch.device("cuda")):
        super().__init__(plans, configuration, fold, dataset_json, device)
        self.num_epochs = 5000
        self.enable_deep_supervision = True
        self.classe_weights = None
   
    # ------------------------------------------------------------------
    #  AdamW optimiser (lr and wd will be taken from plans.json)
    # ------------------------------------------------------------------
    
        
    def configure_optimizers(self):
        import math
        import torch
        from torch.optim.lr_scheduler import LambdaLR

        optimizer = torch.optim.AdamW(
            self.network.parameters(),
            lr=1e-4,
            weight_decay=self.weight_decay,
        )

        total_epochs = self.num_epochs
        min_lr = 1e-6
        base_lr = 1e-4

        def lr_lambda(epoch):
            # epoch is provided by nnU-Net: scheduler.step(epoch)
            progress = epoch / max(1, total_epochs - 1)
            cosine = 0.5 * (1 + math.cos(math.pi * progress))
            return cosine * (1 - min_lr / base_lr) + min_lr / base_lr

        scheduler = LambdaLR(optimizer, lr_lambda=lr_lambda)

        return optimizer, scheduler
    # -------------------------------------------------
    def configure_network(self):
            """
            Initialize Attention U-Net (2D) with deep supervision compatible configuration.
            """

            n_mod = self.plans["num_modalities"]
            n_cls = self.plans["num_classes"]
           
            self.network = smp.DeepLabV3Plus(
                encoder_name="tu-hrnet_w48",   # or "tu-hrnet_w64",
                encoder_weights=None,
                in_channels=self.plans["num_modalities"],
                classes=self.plans["num_classes"],
            )

            #  Initialize 4-channel stem from RGB mean
            #with torch.no_grad():
            #    conv1 = self.network.encoder.conv1
            #    w = conv1.weight                       # [C_out, 4, k, k]
            #    rgb_mean = w[:, :3].mean(dim=1, keepdim=True)
            #    w[:, :4] = rgb_mean.repeat(1, 4, 1, 1)
            # Register softmax for inference
            self.network.inference_apply_nonlin = lambda x: F.softmax(x, dim=1)

            #self.print_to_log_file("Attention U-Net initialized with deep supervision.")

    # -------------------------------------------------
    # LOSS – now *weighted* Top-K
    # -------------------------------------------------
    def _build_loss(self):
        assert not self.label_manager.has_regions, "Region training not supported."

        base_loss = TopKLoss(
            ignore_index=self.label_manager.ignore_label if self.label_manager.has_ignore_label else -100,
            k=10,
            weight=self.classe_weights          # <── inject weights here
        )

        if self.enable_deep_supervision:
            ds_scales = self._get_deep_supervision_scales()
            weights = np.array([1 / (2 ** i) for i in range(len(ds_scales))])
            weights[-1] = 0
            weights /= weights.sum()
            self.print_to_log_file(f"Deep-supervision scales: {ds_scales}, weights: {weights}")
            return DeepSupervisionWrapper(base_loss, weights)
        return base_loss

    # -------------------------------------------------
    # Forward – unchanged
    # -------------------------------------------------
    def get_network_output(self, data, do_mixed_precision=True):
        if do_mixed_precision:
            with torch.cuda.amp.autocast():
                return self.network(data)
        else:
            return self.network(data)
