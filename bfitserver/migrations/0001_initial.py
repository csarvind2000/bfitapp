# Generated by Django 5.1.4 on 2025-06-30 09:09

import bfitserver.models.dicomweb
import django.contrib.auth.models
import django.contrib.auth.validators
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='PACSSeries',
            fields=[
                ('series_id', models.CharField(db_column='Series Instance UID', max_length=64, primary_key=True, serialize=False)),
                ('modality', models.CharField(choices=[('abd', 'ABD'), ('thigh', 'THIGH')], max_length=10)),
                ('num_frames', models.IntegerField(null=True)),
            ],
        ),
        migrations.CreateModel(
            name='PACSStudy',
            fields=[
                ('study_id', models.CharField(db_column='Study Instance UID', max_length=64, primary_key=True, serialize=False)),
                ('patient_id', models.TextField(blank=True, db_column='Patient ID', null=True)),
                ('patient_name', models.TextField(blank=True, db_column='Patient Name', null=True)),
                ('study_date', models.DateField(blank=True, null=True)),
            ],
        ),
        migrations.CreateModel(
            name='User',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('username', models.CharField(error_messages={'unique': 'A user with that username already exists.'}, help_text='Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.', max_length=150, unique=True, validators=[django.contrib.auth.validators.UnicodeUsernameValidator()], verbose_name='username')),
                ('first_name', models.CharField(blank=True, max_length=150, verbose_name='first name')),
                ('last_name', models.CharField(blank=True, max_length=150, verbose_name='last name')),
                ('email', models.EmailField(blank=True, max_length=254, verbose_name='email address')),
                ('is_staff', models.BooleanField(default=False, help_text='Designates whether the user can log into this admin site.', verbose_name='staff status')),
                ('is_active', models.BooleanField(default=True, help_text='Designates whether this user should be treated as active. Unselect this instead of deleting accounts.', verbose_name='active')),
                ('date_joined', models.DateTimeField(default=django.utils.timezone.now, verbose_name='date joined')),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.permission', verbose_name='user permissions')),
            ],
            options={
                'verbose_name': 'user',
                'verbose_name_plural': 'users',
                'abstract': False,
            },
            managers=[
                ('objects', django.contrib.auth.models.UserManager()),
            ],
        ),
        migrations.CreateModel(
            name='PACSInstance',
            fields=[
                ('instance_id', models.CharField(db_column='SOP Instancce UID', max_length=64, primary_key=True, serialize=False)),
                ('location', models.FilePathField(max_length=255, path='/pacs-dicom')),
                ('series', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='bfitserver.pacsseries')),
            ],
        ),
        migrations.AddField(
            model_name='pacsseries',
            name='study',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='bfitserver.pacsstudy'),
        ),
        migrations.CreateModel(
            name='Study',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('study_id', models.CharField(db_column='Study Instance UID', max_length=64)),
                ('patient_id', models.TextField(blank=True, db_column='Patient ID', null=True)),
                ('patient_name', models.TextField(blank=True, db_column='Patient Name', null=True)),
                ('study_date', models.DateField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='study', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'Study',
            },
        ),
        migrations.CreateModel(
            name='Series',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('series_id', models.CharField(db_column='Series Instance UID', max_length=64)),
                ('modality', models.CharField(choices=[('abd', 'ABD'), ('thigh', 'THIGH')], max_length=10)),
                ('num_frames', models.IntegerField(null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='series', to=settings.AUTH_USER_MODEL)),
                ('study', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='bfitserver.study')),
            ],
            options={
                'db_table': 'Series',
            },
        ),
        migrations.CreateModel(
            name='Instance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('instance_id', models.CharField(db_column='SOP Instancce UID', max_length=64)),
                ('metadata', models.JSONField(default=dict)),
                ('frame_number', models.IntegerField(null=True)),
                ('file', models.FileField(max_length=255, upload_to=bfitserver.models.dicomweb.get_dicomweb_instance_upload_path)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='instance', to=settings.AUTH_USER_MODEL)),
                ('series', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='bfitserver.series')),
            ],
            options={
                'db_table': 'Instance',
                'constraints': [models.UniqueConstraint(fields=('instance_id', 'owner'), name='instance_id_owner_uniq')],
            },
        ),
        migrations.AddConstraint(
            model_name='study',
            constraint=models.UniqueConstraint(fields=('study_id', 'owner'), name='study_id_owner_uniq'),
        ),
        migrations.AddConstraint(
            model_name='series',
            constraint=models.UniqueConstraint(fields=('series_id', 'owner'), name='series_id_owner_uniq'),
        ),
    ]
