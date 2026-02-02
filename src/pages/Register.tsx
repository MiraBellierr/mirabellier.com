import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Register = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to login since we now use Discord OAuth
    navigate("/login");
  }, [navigate]);

  return null;
};

export default Register;
