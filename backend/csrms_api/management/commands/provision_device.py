from django.core.management.base import BaseCommand, CommandError

from csrms_api.models import TelemetryDevice


class Command(BaseCommand):
    help = "Provision a telemetry device and print its one-time device key."

    def add_arguments(self, parser):
        parser.add_argument("device_id")
        parser.add_argument("sensor_type", choices=["network", "water", "fire"])
        parser.add_argument("--location", default="")

    def handle(self, *args, **options):
        device_id = options["device_id"]
        if TelemetryDevice.objects.filter(device_id=device_id).exists():
            raise CommandError(f"Telemetry device {device_id!r} already exists.")
        device, raw_key = TelemetryDevice.provision(device_id, options["sensor_type"], options["location"])
        self.stdout.write(self.style.SUCCESS(f"Provisioned {device.device_id} ({device.sensor_type})."))
        self.stdout.write(f"Store this key securely; it will not be shown again: {raw_key}")
