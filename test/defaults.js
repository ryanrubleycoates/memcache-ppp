require('chai').should();

const { expect } = require('chai');
// const { expect } = require('chai');
// const { isObject } = require('../lib/misc');

const defaults = require('../lib/defaults');

describe('Defaults', () => {

  describe('connectionDefaults', () => {
    it('Should have connectionDefaults property', () => {
      defaults.should.have.property('connectionDefaults');
    });

    it('connectionDefaults should be a function', () => {
      defaults.connectionDefaults.should.be.a('function');
    });

    it('connectionDefaults should returns an object', () => {
      defaults.connectionDefaults().should.be.an('object');
    });

    it('connectionDefaults should have properties', () => {
      const keys = Object.keys(defaults.connectionDefaults());
      expect(keys.length).to.be.above(0);
    });
  });


  describe('clientDefaults', () => {
    it('Should have clientDefaults property', () => {
      defaults.should.have.property('clientDefaults');
    });

    it('clientDefaults should be a function', () => {
      defaults.clientDefaults.should.be.a('function');
    });

    it('clientDefaults should returns an object', () => {
      defaults.clientDefaults().should.be.an('object');
    });

    it('clientDefaults should have properties', () => {
      const keys = Object.keys(defaults.clientDefaults());
      expect(keys.length).to.be.above(0);
    });
  });
});
