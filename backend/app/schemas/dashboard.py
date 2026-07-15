from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_users: int
    active_users: int


class DashboardOut(BaseModel):
    message: str
    stats: DashboardStats
