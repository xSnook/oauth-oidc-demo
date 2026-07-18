from pydantic import BaseModel, Field


class TokenLoginRequest(BaseModel):
    id_token: str = Field(min_length=1)
    nonce: str = Field(min_length=1)


class NonceResponse(BaseModel):
    nonce: str
