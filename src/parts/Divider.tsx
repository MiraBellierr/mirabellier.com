import divider from "../assets/divider.webp";

const Divider = () => {
  return (
    <div className="flex flex-row">
      <img
        className="h-5 w-[186px] hidden md:block"
        src={divider}
        width="186"
        height="20"
        alt="divider"
      />
      <img
        className="h-5 w-[186px] hidden md:block"
        src={divider}
        width="186"
        height="20"
        alt="divider"
      />
      <img
        className="h-5 w-[186px] hidden md:block"
        src={divider}
        width="186"
        height="20"
        alt="divider"
      />
    </div>
  );
};

export default Divider;
