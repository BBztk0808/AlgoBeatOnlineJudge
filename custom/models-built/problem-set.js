"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
exports.__esModule = true;
var TypeORM = require("typeorm");
var common_1 = require("./common");
var ProblemSet = /** @class */ (function (_super) {
    __extends(ProblemSet, _super);
    function ProblemSet() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ProblemSet.cache = false;
    ProblemSet.prototype.isOwnedBy = function (user) {
        return !!(user && this.user_id === user.id);
    };
    ProblemSet.prototype.isPublic = function () {
        return this.visibility === 'public';
    };
    __decorate([
        TypeORM.PrimaryGeneratedColumn(),
        __metadata("design:type", Number)
    ], ProblemSet.prototype, "id");
    __decorate([
        TypeORM.Index(),
        TypeORM.Column({ type: "integer" }),
        __metadata("design:type", Number)
    ], ProblemSet.prototype, "user_id");
    __decorate([
        TypeORM.Column({ type: "varchar", length: 80 }),
        __metadata("design:type", String)
    ], ProblemSet.prototype, "title");
    __decorate([
        TypeORM.Column({ nullable: true, type: "mediumtext" }),
        __metadata("design:type", String)
    ], ProblemSet.prototype, "description");
    __decorate([
        TypeORM.Index(),
        TypeORM.Column({ "default": "private", type: "varchar", length: 20 }),
        __metadata("design:type", String)
    ], ProblemSet.prototype, "visibility");
    __decorate([
        TypeORM.Column({ "default": 0, type: "integer" }),
        __metadata("design:type", Number)
    ], ProblemSet.prototype, "items_count");
    __decorate([
        TypeORM.Column({ type: "integer" }),
        __metadata("design:type", Number)
    ], ProblemSet.prototype, "created_at");
    __decorate([
        TypeORM.Column({ type: "integer" }),
        __metadata("design:type", Number)
    ], ProblemSet.prototype, "updated_at");
    ProblemSet = __decorate([
        TypeORM.Entity({ name: "problem_set" })
    ], ProblemSet);
    return ProblemSet;
}(common_1["default"]));
exports["default"] = ProblemSet;
