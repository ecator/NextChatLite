import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";

export function AuthPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(Path.Chat);
  }, [navigate]);

  return null;
}
