import divider1x from "../assets/divider-1x-inline.webp?inline";
import divider15x from "../assets/divider-15x-inline.webp?inline";

const Divider = () => {
  return (
    <div className="flex flex-row">
      {Array.from({ length: 3 }).map((_, index) => (
        <img
          key={index}
          className="h-5 w-[186px] hidden md:block"
          src={divider1x}
          srcSet={`${divider1x} 1x, ${divider15x} 1.5x`}
          width="186"
          height="20"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
      ))}
    </div>
  );
};

export default Divider;
