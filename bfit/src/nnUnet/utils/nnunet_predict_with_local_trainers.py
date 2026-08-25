import importlib
import os
import sys


def register_local_trainer_path() -> None:
    trainer_dir = os.path.dirname(__file__)

    if trainer_dir not in sys.path:
        sys.path.insert(0, trainer_dir)

    import nnunetv2.training.nnUNetTrainer as trainer_package

    if trainer_dir not in trainer_package.__path__:
        trainer_package.__path__.append(trainer_dir)

    importlib.invalidate_caches()


def patch_nnunet_trainer_lookup() -> None:
    trainer_dir = os.path.dirname(__file__)

    import nnunetv2.inference.predict_from_raw_data as predict_module
    from nnunetv2.utilities.find_class_by_name import recursive_find_python_class

    def recursive_find_python_class_with_local_trainers(folder, class_name, current_module):
        trainer_class = recursive_find_python_class(folder, class_name, current_module)
        if trainer_class is not None:
            return trainer_class

        if current_module == "nnunetv2.training.nnUNetTrainer":
            register_local_trainer_path()
            return recursive_find_python_class(trainer_dir, class_name, current_module)

        return None

    predict_module.recursive_find_python_class = recursive_find_python_class_with_local_trainers


if __name__ == "__main__":
    register_local_trainer_path()
    patch_nnunet_trainer_lookup()

    from nnunetv2.inference.predict_from_raw_data import predict_entry_point

    raise SystemExit(predict_entry_point())
