from pydantic import BaseModel


class TokenLoginRequest(BaseModel):
    id_token: str
