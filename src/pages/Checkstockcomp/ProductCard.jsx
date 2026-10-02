import React from 'react';
import './ProductCard.css';

const ProductCard = ({ name, price, description, image }) => {
  return (
    <div className="product-wrapper-container">
      <div className="product-wrapper">
        <div className="product-layout">

          {/* Left: Product Name */}
          <div className="section-box product-name-box">
              <div className="detail-label">PRODUCT NAME</div>
              <div className="detail-value">{name}</div>
            
          </div>

          {/* Center: Product Image */}
          <div className="section-box product-image-box">
            <img src={image} alt={name} className="product-image" />
          </div>

          {/* Right: Info Section */}
            <div className="info-table">
              <div className="info-row">
                <div className="info-label">PRICE</div>
                <div className="info-value">{price}</div>
              </div>
              <div className="info-row">
                <div className="info-label">GODOWN STOCK</div>
                <div className="info-value">{description}</div>
              </div>
              <div className="info-row">
                <div className="info-label">SHOWROOM LOCATION</div>
                <div className="info-value">{description}</div>
              </div>
              <div className="info-row">
                <div className="info-label">SHOWROOM STOCK</div>
                <div className="info-value">{description}</div>
              </div>
              <div className="info-row">
                <div className="info-label">TOP GODOWN STOCK</div>
                <div className="info-value">{description}</div>
              </div>
                <div className="info-row">
                <div className="info-label">GODOWN LOCATION</div>
                <div className="info-value">{description}</div>
              </div>
            </div>


        </div>
      </div>
    </div>
  );
};

export default ProductCard;
