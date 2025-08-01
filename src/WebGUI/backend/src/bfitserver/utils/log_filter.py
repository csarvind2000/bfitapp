import logging

class TruncateLogFilter(logging.Filter):
    def __init__(self, max_length=500):
        super().__init__()
        self.max_length = max_length 

    def filter(self, record):
        if len(record.msg) > self.max_length:
            record.msg = record.msg[:self.max_length] + "..."
        return True