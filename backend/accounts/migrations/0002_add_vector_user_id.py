from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="vector_uga_user_id",
            field=models.CharField(
                blank=True,
                db_index=True,
                default="",
                help_text="UGAUser ID from Vector (user_id claim from Vector JWT)",
                max_length=255,
            ),
        ),
    ]
