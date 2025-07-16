import signal
import logging
import traceback
from django_rq import get_connection
from rq.worker import SimpleWorker
from rq.command import send_stop_job_command
from rq.exceptions import InvalidJobOperation
from .models.analysis import Analysis

logger = logging.getLogger("rq.worker")


class AIWorker(SimpleWorker):
    """
    Custom RQ Worker class for handling worker shutdown.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._logger = logger
        self._logger.info("Instantiating the AI Worker")
        signal.signal(signal.SIGTERM, self.handle_shutdown)
        signal.signal(signal.SIGINT, self.handle_shutdown)

    def handle_shutdown(self, signum, frame):
        """
        Handle worker shutdown.
        """
        self._logger.info(f"Worker received signal {signum}, shutting down...")
        current_job = self.get_current_job()
        if current_job:
            try:
                conn = get_connection(current_job.origin)
                send_stop_job_command(conn, current_job.id)
                self._logger.info(f"Terminated running job {current_job.id}")
                Analysis.objects.filter(id=current_job.id).update(
                    status=Analysis.Status.CANCELED
                )
            except InvalidJobOperation:
                self._logger.error(
                    f"Failed to terminate job {current_job.id}, either it has finished execution or does not exist"
                )
            except Exception:
                self._logger.warning(
                    f"Failed to handle termination of job {current_job.id}"
                )
                self._logger.error(traceback.format_exc())
