from marshmallow import Schema, fields, post_load, validate

from ...common.validators import TrimmedString, not_blank, validate_password


class RegisterSchema(Schema):
    email = TrimmedString(
        required=True, validate=[validate.Email(error="Enter a valid email address."), validate.Length(max=255)]
    )
    password = fields.String(required=True, validate=validate_password)
    display_name = TrimmedString(validate=validate.Length(min=1, max=80))

    @post_load
    def normalize(self, data, **_kwargs):
        data["email"] = data["email"].lower()
        if not data.get("display_name"):
            data["display_name"] = data["email"].split("@")[0][:80]
        return data


class LoginSchema(Schema):
    email = TrimmedString(required=True, validate=not_blank)
    password = fields.String(required=True, validate=not_blank)

    @post_load
    def normalize(self, data, **_kwargs):
        data["email"] = data["email"].lower()
        return data


class LogoutSchema(Schema):
    refresh_token = fields.String()


class UpdateProfileSchema(Schema):
    display_name = TrimmedString(validate=validate.Length(min=1, max=80))


class ChangePasswordSchema(Schema):
    current_password = fields.String(required=True, validate=not_blank)
    new_password = fields.String(required=True, validate=validate_password)


class DeleteAccountSchema(Schema):
    password = fields.String(required=True, validate=not_blank)
